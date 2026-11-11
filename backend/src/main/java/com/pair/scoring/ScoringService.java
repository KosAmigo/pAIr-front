package com.pair.scoring;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.pair.ai.AssistantClient;
import com.pair.ai.JudgeClient;
import com.pair.attempt.Attempt;
import com.pair.attempt.AttemptStore;
import com.pair.attempt.ChatTurn;
import com.pair.config.PairProperties;
import com.pair.run.CodeRunner;
import com.pair.task.TaskDef;
import com.pair.task.TaskRepository;

import jakarta.annotation.PreDestroy;

/**
 * 제출된 응시를 채점한다: D1(숨은 테스트/체크리스트), D4(시간), R2(핵심 턴 다시 실행), 나머지는 채점 LLM.
 * 결과는 report.json 과 콘솔 요약으로 남긴다.
 */
@Service
public class ScoringService {

    private static final Logger log = LoggerFactory.getLogger(ScoringService.class);

    private final AttemptStore store;
    private final TaskRepository tasks;
    private final CodeRunner runner;
    private final AssistantClient assistant;
    private final JudgeClient judge;
    private final PairProperties props;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "scoring");
        t.setDaemon(true);
        return t;
    });

    public ScoringService(AttemptStore store, TaskRepository tasks, CodeRunner runner,
                          AssistantClient assistant, JudgeClient judge, PairProperties props) {
        this.store = store;
        this.tasks = tasks;
        this.runner = runner;
        this.assistant = assistant;
        this.judge = judge;
        this.props = props;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    public void scoreAsync(String attemptId) {
        executor.submit(() -> {
            try {
                score(attemptId);
            } catch (Exception e) {
                log.error("채점 실패: {}", attemptId, e);
                store.save(store.load(attemptId).withError(e.getMessage() == null ? e.toString() : e.getMessage()));
            }
        });
    }

    // ── 채점 모델 응답 형식 ──────────────

    public record CriterionScore(String code, int score, List<String> evidence, String reason) {}

    public record RubricResult(List<CriterionScore> scores) {}

    public record ReplayVerdict(int replay, boolean same, String reason) {}

    public record ReplayJudgement(List<ReplayVerdict> verdicts) {}

    // ── 리포트 형식 ───────────────────

    public record SubScore(String code, String name, int weight, Integer score, String note, List<String> evidence) {}

    public record Item(String key, String name, Double score, List<SubScore> sub) {}

    public record KeyTurn(int turn, double adoption, List<String> replays, List<ReplayVerdict> verdicts) {}

    public void score(String attemptId) {
        Attempt a = store.load(attemptId);
        TaskDef task = tasks.get(a.taskId());
        List<ChatTurn> turns = store.turns(attemptId);
        Map<String, String> files = store.readFiles(attemptId);
        long judgeIn = 0, judgeOut = 0, replayIn = 0, replayOut = 0;
        Map<String, SubScore> subs = new LinkedHashMap<>();
        List<String> notes = new ArrayList<>();
        Map<String, Object> extras = new LinkedHashMap<>();

        // ── D1 (개발: 숨은 테스트) ─────────
        Integer d1 = null;
        if (task.isDev()) {
            Map<String, String> sources = new HashMap<>();
            files.forEach((k, v) -> {
                if (k.startsWith("src/") && k.endsWith(".java")) sources.put(k, v);
            });
            tasks.hiddenFiles(task.id()).forEach((k, v) -> sources.put("hidden/" + k, v));
            CodeRunner.RunResult hr = runner.run(sources);
            int reqTotal = 0, reqPass = 0;
            boolean optPass = false;
            for (CodeRunner.TestCase tc : hr.tests()) {
                if (tc.name().contains("required_")) {
                    reqTotal++;
                    if (tc.passed()) reqPass++;
                } else if (tc.name().contains("optional_") && tc.passed()) {
                    optPass = true;
                }
            }
            if (reqTotal == 0) reqTotal = 4;
            int originalTests = countTests(tasks.visibleFiles(task.id()));
            int nowTests = countTests(files);
            boolean addedTest = nowTests > originalTests;
            boolean notesFilled = notesFilled(files.getOrDefault("NOTES.md", ""));
            int extrasCount = (optPass ? 1 : 0) + (addedTest ? 1 : 0) + (notesFilled ? 1 : 0);
            if (!hr.compiled()) d1 = 10;
            else if (reqPass == reqTotal) d1 = extrasCount == 3 ? 95 : extrasCount == 2 ? 88 : 72;
            else if (reqPass * 4 >= reqTotal * 3) d1 = 50;
            else if (reqPass * 2 >= reqTotal) d1 = 35;
            else d1 = 20;
            String note = (hr.compiled() ? "" : "컴파일 실패. ") + "숨은 필수 테스트 " + reqPass + "/" + reqTotal + " 통과"
                    + ", 선택 테스트 " + (optPass ? "통과" : "실패")
                    + ", 테스트 추가 " + (addedTest ? "함(" + originalTests + "→" + nowTests + "개)" : "안 함")
                    + ", NOTES.md " + (notesFilled ? "작성" : "미작성");
            subs.put("D1", sub("D1", d1, note, List.of("숨은 테스트")));
            List<Map<String, Object>> hidden = new ArrayList<>();
            for (CodeRunner.TestCase tc : hr.tests()) {
                hidden.add(Map.of("name", tc.name().replaceFirst("^shop\\.HiddenOrderTest\\.", ""), "passed", tc.passed()));
            }
            extras.put("hiddenTests", hidden);
        }

        // ── 채점 LLM: R1, R3, D2, D3, D5 (+ 비개발 D1) ────────
        List<String> codes = new ArrayList<>(List.of("R1", "R3", "D2", "D3", "D5"));
        if (!task.isDev()) codes.add(3, "D1");
        String transcript = transcript(turns, a.startedAt());
        String rubricUser = rubricPrompt(task, codes, transcript, files, a.followUpAnswers());
        JudgeClient.Result<RubricResult> rr = judge.judge(JUDGE_SYSTEM, rubricUser, RubricResult.class);
        judgeIn += rr.inputTokens();
        judgeOut += rr.outputTokens();
        for (CriterionScore cs : rr.value().scores()) {
            if (!codes.contains(cs.code())) continue;
            boolean hasEvidence = cs.evidence() != null && !cs.evidence().isEmpty();
            Integer s = hasEvidence ? Math.max(0, Math.min(100, cs.score())) : null;
            String note = hasEvidence ? cs.reason() : "근거가 없어 무효 처리: " + cs.reason();
            subs.put(cs.code(), sub(cs.code(), s, note, hasEvidence ? cs.evidence() : List.of()));
            if (cs.code().equals("D1")) d1 = s;
        }

        // ── D4 ─────────
        Integer d4;
        String d4Note;
        Double firstValidMin = a.firstValidAt() == null ? null
                : Duration.between(a.startedAt(), a.firstValidAt()).toSeconds() / 60.0;
        if (firstValidMin == null) {
            d4 = 20;
            d4Note = "첫 유효 결과에 도달하지 못함";
        } else {
            List<Integer> bands = task.d4Minutes();
            int[] pts = {100, 85, 70, 55};
            int s = 40;
            for (int i = 0; i < bands.size() && i < pts.length; i++) {
                if (firstValidMin <= bands.get(i)) {
                    s = pts[i];
                    break;
                }
            }
            d4 = s;
            d4Note = String.format("첫 유효 결과까지 %.1f분 (%s)", firstValidMin,
                    task.isDev() ? "보이는 테스트 첫 전체 통과" : "기획안 필수 제목을 처음 모두 갖춘 저장");
        }
        if (d1 != null && d1 < 40) {
            d4 = 0;
            d4Note = d4Note + ". D1이 40점 미만이라 0점 처리";
        }
        subs.put("D4", sub("D4", d4, d4Note, List.of("응시 이벤트 기록")));

        // ── R2: 핵심 턴 다시 실행 ─────────
        List<KeyTurn> keyTurns = new ArrayList<>();
        List<ChatTurn> aiTurns = turns.stream().filter(t -> "ai".equals(t.role()) && t.request() != null).toList();
        if (aiTurns.isEmpty()) {
            subs.put("R2", sub("R2", null, "AI 어시스턴트를 쓰지 않아 측정할 수 없음", List.of()));
        } else {
            String finalText = String.join("\n", files.values());
            Set<String> finalGrams = grams(finalText);
            List<ChatTurn> ranked = new ArrayList<>(aiTurns);
            Map<Integer, Double> adoption = new HashMap<>();
            for (ChatTurn t : aiTurns) adoption.put(t.turn(), adoptionRatio(t.text(), finalGrams));
            ranked.sort(Comparator.comparingDouble((ChatTurn t) -> adoption.get(t.turn())).reversed());
            List<ChatTurn> chosen = ranked.stream().filter(t -> adoption.get(t.turn()) >= 0.05)
                    .limit(props.r2().maxKeyTurns()).toList();
            if (chosen.isEmpty()) {
                chosen = List.of(ranked.get(0));
                notes.add("최종 결과물에 AI 답변이 거의 남지 않아, 채택률이 가장 높은 AI 턴 1개로 R2를 측정함");
            }
            int same = 0, total = 0;
            for (ChatTurn t : chosen) {
                List<String> replays = new ArrayList<>();
                for (int i = 0; i < props.r2().replaysPerTurn(); i++) {
                    AssistantClient.Reply rep = assistant.send(t.request());
                    replayIn += rep.inputTokens();
                    replayOut += rep.outputTokens();
                    replays.add(rep.text());
                }
                JudgeClient.Result<ReplayJudgement> rj = judge.judge(REPLAY_SYSTEM,
                        replayPrompt(t, replays), ReplayJudgement.class);
                judgeIn += rj.inputTokens();
                judgeOut += rj.outputTokens();
                for (ReplayVerdict v : rj.value().verdicts()) {
                    total++;
                    if (v.same()) same++;
                }
                keyTurns.add(new KeyTurn(t.turn(), round(adoption.get(t.turn())), replays, rj.value().verdicts()));
            }
            double agreement = total == 0 ? 0 : (double) same / total;
            int r2 = agreement >= 0.95 ? 95 : agreement >= 0.8 ? 85 : agreement >= 0.5 ? 65 : agreement >= 0.3 ? 45 : 25;
            List<String> ev = keyTurns.stream().map(k -> "#T" + pad(k.turn())).toList();
            subs.put("R2", sub("R2", r2, String.format("핵심 턴 %d개를 %d번씩 다시 실행, 같은 해결책 %d/%d (%.0f%%)",
                    chosen.size(), props.r2().replaysPerTurn(), same, total, agreement * 100), ev));
            extras.put("r2KeyTurns", keyTurns);
        }

        // ── 항목 점수 ─────────
        List<Item> items = new ArrayList<>();
        for (String key : Rubric.ITEM_NAMES.keySet()) {
            List<SubScore> list = new ArrayList<>();
            double sum = 0, weights = 0;
            for (Rubric.Criterion c : Rubric.ALL) {
                if (!c.item().equals(key)) continue;
                SubScore s = subs.getOrDefault(c.code(), sub(c.code(), null, "채점 결과 없음", List.of()));
                list.add(s);
                if (s.score() != null) {
                    sum += s.score() * c.weight();
                    weights += c.weight();
                }
            }
            Double score = weights == 0 ? null : round1(sum / weights);
            if (weights > 0 && weights < 100) notes.add(Rubric.ITEM_NAMES.get(key) + ": 측정하지 못한 하위 기준을 빼고 나머지 가중치로 계산함");
            items.add(new Item(key, Rubric.ITEM_NAMES.get(key), score, list));
        }

        notes.add("파일럿 단순화: R2는 다시 나온 답변을 채점 LLM이 원래 답변과 같은 해결책인지 판정해 비교함(숨은 테스트 적용 아님)");
        notes.add("파일럿 단순화: D4는 응시자 분포 대신 과제별 목표 시간 구간(" + task.d4Minutes() + "분)으로 환산함");

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("attemptId", a.id());
        report.put("taskId", task.id());
        report.put("taskTitle", task.title());
        report.put("taskType", task.type());
        report.put("assistant", a.provider() + " / " + a.model());
        report.put("judgeModel", props.judge().model());
        report.put("startedAt", a.startedAt());
        report.put("submittedAt", a.submittedAt());
        report.put("durationSec", a.submittedAt() == null ? null : Duration.between(a.startedAt(), a.submittedAt()).toSeconds());
        report.put("chatTurns", turns.size());
        report.put("firstValidMinutes", firstValidMin == null ? null : round1(firstValidMin));
        report.put("items", items);
        report.put("notes", notes);
        report.putAll(extras);
        long assistantIn = turns.stream().filter(t -> t.inputTokens() != null).mapToLong(ChatTurn::inputTokens).sum();
        long assistantOut = turns.stream().filter(t -> t.outputTokens() != null).mapToLong(ChatTurn::outputTokens).sum();
        report.put("tokens", Map.of(
                "assistant", Map.of("input", assistantIn, "output", assistantOut),
                "r2Replay", Map.of("input", replayIn, "output", replayOut),
                "judge", Map.of("input", judgeIn, "output", judgeOut)));
        report.put("transcript", turns.stream().map(t -> Map.of(
                "turn", t.turn(), "role", t.role(), "time", clock(a.startedAt(), t.at()), "text", t.text())).toList());
        store.writeReport(a.id(), report);
        store.save(store.load(a.id()).withStatus(Attempt.Status.DONE));
        logSummary(a, task, items);
    }

    // ── 프롬프트 ───────────────────────

    private static final String JUDGE_SYSTEM = """
            당신은 AI 활용 역량 평가의 채점자입니다. 응시자가 AI 어시스턴트와 함께 과제를 푼 기록을 보고,
            주어진 점수 기준에 따라 하위 기준별 점수(0~100 정수)를 매깁니다.
            규칙:
            - 점수 기준의 90/70/50/25점 설명을 기준점으로 삼고, 사이 값도 쓸 수 있습니다.
            - evidence 에는 근거가 된 대화 턴 번호(예: "#T03")나 파일 이름(예: "NOTES.md")을 1개 이상 넣습니다. 근거를 댈 수 없으면 빈 배열로 둡니다.
            - reason 은 한국어 한두 문장으로, 응시자에게 보여 줄 피드백입니다.
            - AI 답변이 길거나 정중하다고 점수를 주지 않습니다. 응시자가 무엇을 지시하고, 무엇을 검증하고, 무엇을 결과물에 남겼는지를 봅니다.
            """;

    private static final String REPLAY_SYSTEM = """
            같은 요청을 AI 모델에 다시 보냈을 때 나온 답변들이 원래 답변과 "같은 해결책"인지 판정합니다.
            표현, 순서, 변수 이름이 달라도 핵심 진단과 해결 방법이 같으면 same=true 입니다.
            핵심 원인 진단이 다르거나, 제안한 해결 방법이 다르거나, 원래 답변에 있던 핵심 요소가 빠졌으면 same=false 입니다.
            reason 은 한국어 한 문장입니다.
            """;

    private String rubricPrompt(TaskDef task, List<String> codes, String transcript,
                                Map<String, String> files, List<String> answers) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 과제\n").append(task.title()).append(" (").append(task.isDev() ? "개발" : "비개발").append(")\n");
        task.description().forEach(d -> sb.append(d).append("\n"));
        sb.append("\n## 요구사항\n");
        task.requirements().forEach(r -> sb.append("- ").append(r).append("\n"));
        if (!task.isDev()) {
            sb.append("\n## D1 채점용 숨은 체크리스트 (응시자는 보지 못함)\n")
              .append(tasks.hiddenFiles(task.id()).getOrDefault("checklist.md", "")).append("\n");
        }
        sb.append("\n# 채점할 하위 기준: ").append(String.join(", ", codes)).append("\n\n");
        sb.append(Rubric.anchorsText(codes));
        sb.append("# 대화 기록 (응시자는 AI가 대화창에 붙여 넣은 내용만 볼 수 있다는 것을 안내받았음)\n").append(transcript).append("\n");
        sb.append("# 최종 제출 파일\n");
        Map<String, String> original = tasks.visibleFiles(task.id());
        files.forEach((path, content) -> {
            if (path.startsWith("logs/") || path.startsWith("자료/")) return;
            boolean changed = !content.equals(original.get(path));
            sb.append("## ").append(path).append(changed ? " (수정됨)" : " (원본 그대로)").append("\n```\n").append(content).append("\n```\n");
        });
        sb.append("\n# 후속 질문 답변\n");
        for (int i = 0; i < task.followUps().size(); i++) {
            String ans = answers != null && i < answers.size() ? answers.get(i) : "";
            sb.append("Q").append(i + 1).append(". ").append(task.followUps().get(i)).append("\nA. ").append(ans.isBlank() ? "(무응답)" : ans).append("\n\n");
        }
        sb.append("\n각 하위 기준(").append(String.join(", ", codes)).append(")에 대해 code, score, evidence, reason 을 채워 scores 배열로 답하세요.");
        return sb.toString();
    }

    private static String replayPrompt(ChatTurn original, List<String> replays) {
        StringBuilder sb = new StringBuilder();
        List<ChatTurn.Message> msgs = original.request().messages();
        String lastUser = msgs.isEmpty() ? "" : msgs.get(msgs.size() - 1).content();
        sb.append("# 응시자의 마지막 요청\n").append(lastUser).append("\n\n");
        sb.append("# 원래 답변 (#T").append(pad(original.turn())).append(")\n").append(original.text()).append("\n\n");
        for (int i = 0; i < replays.size(); i++) {
            sb.append("# 다시 실행 ").append(i + 1).append("\n").append(replays.get(i)).append("\n\n");
        }
        sb.append("다시 실행한 답변마다 replay(1부터), same, reason 을 채워 verdicts 배열로 답하세요.");
        return sb.toString();
    }

    // ── 보조 함수 ─────────────────────

    private static SubScore sub(String code, Integer score, String note, List<String> evidence) {
        Rubric.Criterion c = Rubric.get(code);
        return new SubScore(code, c.name(), c.weight(), score, note, evidence);
    }

    static String transcript(List<ChatTurn> turns, Instant start) {
        StringBuilder sb = new StringBuilder();
        for (ChatTurn t : turns) {
            sb.append("#T").append(pad(t.turn())).append(" ").append("user".equals(t.role()) ? "응시자" : "AI")
              .append(" ").append(clock(start, t.at())).append("\n").append(t.text()).append("\n\n");
        }
        return sb.isEmpty() ? "(대화 없음)\n" : sb.toString();
    }

    static String clock(Instant start, Instant at) {
        long s = Math.max(0, Duration.between(start, at).toSeconds());
        return String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60);
    }

    static String pad(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }

    static int countTests(Map<String, String> files) {
        int n = 0;
        for (var e : files.entrySet()) {
            if (!e.getKey().startsWith("test/")) continue;
            int i = 0;
            while ((i = e.getValue().indexOf("@Test", i)) >= 0) {
                n++;
                i += 5;
            }
        }
        return n;
    }

    static boolean notesFilled(String notes) {
        return notes.lines().map(String::trim).filter(l -> !l.isEmpty() && !l.startsWith("#")).count() >= 1;
    }

    /** 공백을 무시한 6글자 조각 집합. AI 답변이 최종 파일에 얼마나 남았는지 볼 때 쓴다. */
    static Set<String> grams(String text) {
        String s = text.replaceAll("\\s+", "");
        Set<String> out = new HashSet<>();
        for (int i = 0; i + 6 <= s.length(); i++) out.add(s.substring(i, i + 6));
        return out;
    }

    static double adoptionRatio(String aiText, Set<String> finalGrams) {
        Set<String> g = grams(aiText);
        if (g.isEmpty()) return 0;
        long hit = g.stream().filter(finalGrams::contains).count();
        return (double) hit / g.size();
    }

    private static double round(double v) {
        return Math.round(v * 1000) / 1000.0;
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private void logSummary(Attempt a, TaskDef task, List<Item> items) {
        StringBuilder sb = new StringBuilder("\n========== pAIr 채점 결과 ==========\n");
        sb.append("응시 ").append(a.id()).append(" | ").append(task.title()).append("\n");
        for (Item it : items) {
            sb.append(String.format("%-10s %s%n", it.name(), it.score() == null ? "-" : it.score()));
            for (SubScore s : it.sub()) {
                sb.append(String.format("  %s %-10s %4s  %s%n", s.code(), s.name(), s.score() == null ? "-" : s.score(), s.note()));
            }
        }
        sb.append("리포트 파일: ").append(store.dir(a.id()).resolve("report.json")).append("\n");
        sb.append("====================================");
        log.info(sb.toString());
    }
}
