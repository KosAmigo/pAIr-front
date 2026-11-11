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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.pair.ai.AssistantClient;
import com.pair.ai.AiUnavailableException;
import com.pair.ai.ClaudeJudge;
import com.pair.ai.Judge;
import com.pair.ai.OpenAiJudge;
import com.pair.attempt.Attempt;
import com.pair.attempt.AttemptStore;
import com.pair.attempt.ChatTurn;
import com.pair.config.PairProperties;
import com.pair.run.CodeRunner;
import com.pair.scoring.Rubric.Check;
import com.pair.scoring.Rubric.Method;
import com.pair.task.TaskDef;
import com.pair.task.TaskRepository;

import jakarta.annotation.PreDestroy;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * 감점식 채점 (docs/evaluation/채점_기준표.md).
 * 자동 체크는 기록(숨은 테스트, 이벤트, 다시 실행 결과)으로, 판정 체크는 채점 모델이 근거와 함께 판정한다.
 * 결과는 report.json 과 콘솔 요약으로 남긴다.
 */
@Service
public class ScoringService {

    private static final Logger log = LoggerFactory.getLogger(ScoringService.class);
    static final int D5_LATE_MINUTES = 30;

    private final AttemptStore store;
    private final TaskRepository tasks;
    private final CodeRunner runner;
    private final AssistantClient assistant;
    private final List<Judge> judges;
    private final Judge replayJudge;
    private final PairProperties props;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "scoring");
        t.setDaemon(true);
        return t;
    });

    public ScoringService(AttemptStore store, TaskRepository tasks, CodeRunner runner,
                          AssistantClient assistant, ClaudeJudge claudeJudge, OpenAiJudge openAiJudge, PairProperties props) {
        this.store = store;
        this.tasks = tasks;
        this.runner = runner;
        this.assistant = assistant;
        this.judges = List.of(claudeJudge, openAiJudge);
        this.replayJudge = "claude".equals(props.judge().replayCompare()) ? claudeJudge : openAiJudge;
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

    /** 판정 체크 하나의 결과. count 는 '1개당 감점' 체크(D1 비개발)에서만 쓴다. */
    public record CheckVerdict(String code, boolean violated, int count, List<String> evidence, String reason) {}

    public record JudgeResult(List<CheckVerdict> verdicts) {}

    public record ReplayVerdict(int replay, boolean same, String reason) {}

    public record ReplayJudgement(List<ReplayVerdict> verdicts) {}

    // ── 리포트 형식 ───────────────────

    /**
     * @param status DEDUCTED(감점), PASSED(통과), SKIPPED(적용 안 함), NO_EVIDENCE(걸렸다고 했지만 근거가 없어 감점 안 함),
     *               SPLIT(판정 엇갈림: 두 채점 모델 중 한쪽만 걸렸다고 봄, 감점 안 함)
     * @param judges 판정 체크에서 채점 모델별 판정 (자동 체크는 빈 목록)
     */
    public record CheckResult(String code, String label, String method, int points, int deducted,
                              String status, List<String> evidence, String reason, List<JudgeView> judges) {
        CheckResult(String code, String label, String method, int points, int deducted, String status, List<String> evidence, String reason) {
            this(code, label, method, points, deducted, status, evidence, reason, List.of());
        }
    }

    /** 채점 모델 하나의 판정. */
    public record JudgeView(String judge, String model, boolean violated, int count, List<String> evidence, String reason) {}

    public record ItemResult(String key, String name, int max, int score, List<CheckResult> checks) {}

    public record KeyTurn(int turn, double adoption, List<String> replays, List<ReplayVerdict> verdicts) {}

    public void score(String attemptId) {
        Attempt a = store.load(attemptId);
        TaskDef task = tasks.get(a.taskId());
        boolean dev = task.isDev();
        List<ChatTurn> turns = store.turns(attemptId);
        Map<String, String> files = store.readFiles(attemptId);
        List<JsonNode> events = store.events(attemptId);
        long replayIn = 0, replayOut = 0;
        Map<String, long[]> judgeTokens = new LinkedHashMap<>(); // 모델별 {입력, 출력, 캐시 입력}
        for (Judge j : judges) judgeTokens.put(j.name(), new long[3]);
        Map<String, CheckResult> results = new LinkedHashMap<>();
        List<String> notes = new ArrayList<>();
        Map<String, Object> extras = new LinkedHashMap<>();
        // 빈 AI 답변은 시스템 오류(추론 모델이 한도 안에서 답을 끝내지 못함)라 채점에서 뺀다
        List<ChatTurn> aiTurns = turns.stream().filter(t -> "ai".equals(t.role()) && t.request() != null && !t.text().isBlank()).toList();
        long emptyAi = turns.stream().filter(t -> "ai".equals(t.role()) && t.text().isBlank()).count();
        if (emptyAi > 0) notes.add("시스템 오류로 비어 있는 AI 답변 " + emptyAi + "건은 응시자 책임으로 보지 않음");
        boolean usedAi = !aiTurns.isEmpty();

        // ── 자동: AI 사용 여부 (U0) ─────────
        results.put("U0", auto("U0", dev, usedAi ? 0 : 25, usedAi ? null : "AI 대화 기록이 없습니다."));

        // ── 자동: 숨은 테스트 (D0~D4 개발) ─────────
        if (dev) {
            Map<String, String> sources = new HashMap<>();
            files.forEach((k, v) -> {
                if (k.startsWith("src/") && k.endsWith(".java")) sources.put(k, v);
            });
            tasks.hiddenFiles(task.id()).forEach((k, v) -> sources.put("hidden/" + k, v));
            CodeRunner.RunResult hr = runner.run(sources);
            int reqTotal = 0, reqFail = 0;
            boolean optFail = false;
            for (CodeRunner.TestCase tc : hr.tests()) {
                if (tc.name().contains("required_")) {
                    reqTotal++;
                    if (!tc.passed()) reqFail++;
                } else if (tc.name().contains("optional_") && !tc.passed()) {
                    optFail = true;
                }
            }
            if (!hr.compiled()) {
                reqTotal = 4;
                reqFail = 4;
                optFail = true;
            }
            int originalTests = countTests(tasks.visibleFiles(task.id()));
            int nowTests = countTests(files);
            results.put("D0", auto("D0", dev, hr.compiled() ? 0 : 30, hr.compiled() ? null : "숨은 테스트를 붙여 컴파일하지 못했습니다."));
            results.put("D1", auto("D1", dev, Math.min(20, reqFail * 5),
                    "숨은 필수 테스트 " + (reqTotal - reqFail) + "/" + reqTotal + " 통과" + (reqFail > 0 ? " (실패 " + reqFail + "개 × 5점)" : "")));
            results.put("D2", auto("D2", dev, optFail ? 2 : 0, optFail ? "숨은 선택 테스트(여러 스레드 동시 주문) 실패" : "숨은 선택 테스트 통과"));
            results.put("D3", auto("D3", dev, nowTests > originalTests ? 0 : 3,
                    "테스트 " + originalTests + "개 → " + nowTests + "개"));
            List<Map<String, Object>> hidden = new ArrayList<>();
            for (CodeRunner.TestCase tc : hr.tests()) {
                hidden.add(Map.of("name", tc.name().replaceFirst("^shop\\.HiddenOrderTest\\.", ""), "passed", tc.passed()));
            }
            extras.put("hiddenTests", hidden);
        }

        // ── 자동: 첫 유효 결과 시간 (D5) ─────────
        Instant firstValidAt = dev ? firstValidFromEvents(events) : a.firstValidAt();
        Double firstValidMin = firstValidAt == null ? null
                : Duration.between(a.startedAt(), firstValidAt).toSeconds() / 60.0;
        int d5 = firstValidMin == null ? 4 : firstValidMin > D5_LATE_MINUTES ? 2 : 0;
        results.put("D5", auto("D5", dev, d5, firstValidMin == null
                ? "첫 유효 결과에 도달하지 못함"
                : String.format("첫 유효 결과까지 %.1f분 (%s)", firstValidMin,
                        dev ? "src 코드를 고친 뒤 테스트가 전부 통과한 첫 실행" : "필수 제목을 모두 채운 첫 저장")));

        // ── 자동: 다시 실행 (R1), 결과물 반영률 (R4) ─────────
        List<KeyTurn> keyTurns = new ArrayList<>();
        if (!usedAi) {
            results.put("R1", skipped("R1", dev, "AI를 쓰지 않아 적용하지 않음"));
            results.put("R4", skipped("R4", dev, "AI를 쓰지 않아 적용하지 않음"));
        } else {
            Set<String> finalGrams = grams(String.join("\n", files.values()));
            Map<Integer, Double> adoption = new HashMap<>();
            for (ChatTurn t : aiTurns) adoption.put(t.turn(), adoptionRatio(t.text(), finalGrams));
            List<ChatTurn> ranked = new ArrayList<>(aiTurns);
            ranked.sort(Comparator.comparingDouble((ChatTurn t) -> adoption.get(t.turn())).reversed());
            double best = adoption.get(ranked.get(0).turn());
            results.put("R4", auto("R4", dev, best < 0.05 ? 2 : 0,
                    String.format("AI 답변이 최종 결과물에 남은 비율 최고 %.0f%% (#T%s)", best * 100, pad(ranked.get(0).turn()))));
            List<ChatTurn> chosen = ranked.stream().filter(t -> adoption.get(t.turn()) >= 0.05)
                    .limit(props.r2().maxKeyTurns()).toList();
            if (chosen.isEmpty()) chosen = List.of(ranked.get(0));
            int same = 0, total = 0, replayFailed = 0;
            for (ChatTurn t : chosen) {
                List<String> replays = new ArrayList<>();
                for (int i = 0; i < props.r2().replaysPerTurn(); i++) {
                    AssistantClient.Reply rep = assistant.send(t.request());
                    replayIn += rep.inputTokens();
                    replayOut += rep.outputTokens();
                    if (rep.text().isBlank()) {
                        replayFailed++; // 다시 실행에서 빈 답이 오면 비교에서 뺀다
                        continue;
                    }
                    replays.add(rep.text());
                }
                if (replays.isEmpty()) continue;
                Judge.Result<ReplayJudgement> rj = replayJudge.judge(REPLAY_SYSTEM, "", replayPrompt(t, replays), ReplayJudgement.class);
                addTokens(judgeTokens, replayJudge, rj);
                for (ReplayVerdict v : rj.value().verdicts()) {
                    total++;
                    if (v.same()) same++;
                }
                keyTurns.add(new KeyTurn(t.turn(), round(adoption.get(t.turn())), replays, rj.value().verdicts()));
            }
            double diffRate = total == 0 ? 0 : (double) (total - same) / total;
            int r1 = (int) Math.round(diffRate * 8);
            List<String> ev = keyTurns.stream().map(k -> "#T" + pad(k.turn())).toList();
            results.put("R1", new CheckResult("R1", check("R1", dev).label(), "AUTO", 8, r1, r1 > 0 ? "DEDUCTED" : "PASSED", ev,
                    String.format("핵심 턴 %d개를 %d번씩 다시 실행, 다른 해결책 %d/%d", chosen.size(), props.r2().replaysPerTurn(), total - same, total)
                            + (replayFailed > 0 ? " (빈 답 " + replayFailed + "건은 비교에서 제외)" : "")));
            extras.put("r2KeyTurns", keyTurns);
        }

        // ── 판정: 채점 모델 ─────────
        List<Check> judgeChecks = Rubric.checksFor(dev).stream()
                .filter(c -> c.method() == Method.JUDGE)
                .filter(c -> usedAi || !c.item().equals("usage"))
                .toList();
        if (!usedAi) {
            Rubric.checksFor(dev).stream().filter(c -> c.item().equals("usage") && c.method() == Method.JUDGE)
                    .forEach(c -> results.put(c.code(), skipped(c.code(), dev, "U0 적용으로 판정하지 않음")));
        }
        String prefix = judgePrefix(task, judgeChecks);
        String body = judgeBody(task, judgeChecks, transcript(turns, a.startedAt()), files, a.followUpAnswers(), eventSummary(events, a.startedAt()));
        // 두 채점 모델을 동시에 부른다. 한쪽이 실패하면 남은 한쪽으로만 판정한다.
        Map<Judge, CompletableFuture<Judge.Result<JudgeResult>>> calls = new LinkedHashMap<>();
        for (Judge j : judges) calls.put(j, CompletableFuture.supplyAsync(() -> j.judge(JUDGE_SYSTEM, prefix, body, JudgeResult.class)));
        Map<Judge, Map<String, CheckVerdict>> byJudge = new LinkedHashMap<>();
        List<String> failures = new ArrayList<>();
        for (var e : calls.entrySet()) {
            try {
                Judge.Result<JudgeResult> jr = e.getValue().join();
                addTokens(judgeTokens, e.getKey(), jr);
                Map<String, CheckVerdict> m = new HashMap<>();
                for (CheckVerdict v : jr.value().verdicts()) m.put(v.code(), v);
                byJudge.put(e.getKey(), m);
            } catch (CompletionException ex) {
                Throwable cause = ex.getCause() == null ? ex : ex.getCause();
                log.warn("채점 모델 {} 실패: {}", e.getKey().model(), cause.getMessage());
                failures.add(e.getKey().model() + ": " + cause.getMessage());
            }
        }
        if (byJudge.isEmpty()) throw new AiUnavailableException("채점 모델 두 개가 모두 실패했습니다. " + String.join(" / ", failures));
        if (!failures.isEmpty()) notes.add("채점 모델 한쪽이 실패해 남은 모델로만 판정함 (" + String.join(" / ", failures) + ")");
        for (Check c : judgeChecks) results.put(c.code(), combine(c, byJudge));

        // ── 항목 점수 ─────────
        List<ItemResult> items = new ArrayList<>();
        int total = 0;
        for (Rubric.Item item : Rubric.ITEMS) {
            List<CheckResult> list = new ArrayList<>();
            int deducted = 0;
            for (Check c : Rubric.checksFor(dev)) {
                if (!c.item().equals(item.key())) continue;
                CheckResult r = results.get(c.code());
                if (r == null) continue;
                list.add(r);
                deducted += r.deducted();
            }
            int score = Math.max(0, item.max() - deducted);
            total += score;
            items.add(new ItemResult(item.key(), item.name(), item.max(), score, list));
        }

        notes.add("채점 기준: docs/evaluation/채점_기준표.md (감점식, 총점 " + Rubric.total() + "점)");
        notes.add("이중 채점: 판정 체크는 두 채점 모델(" + String.join(", ", judges.stream().map(Judge::model).toList())
                + ")이 모두 근거(대화 턴, 파일)를 대고 걸렸다고 할 때만 감점함. 한쪽만 걸렸다고 하면 '판정 엇갈림'으로 감점하지 않음");
        notes.add("파일럿 단순화: 다시 실행(R1)은 다시 나온 답변을 채점 모델이 원래 답변과 같은 해결책인지 판정해 비교함");

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("version", 2);
        report.put("attemptId", a.id());
        report.put("taskId", task.id());
        report.put("taskTitle", task.title());
        report.put("taskType", task.type());
        report.put("assistant", a.provider() + " / " + a.model());
        report.put("judgeModel", String.join(" + ", judges.stream().map(Judge::model).toList()));
        report.put("replayJudge", replayJudge.model());
        report.put("startedAt", a.startedAt());
        report.put("submittedAt", a.submittedAt());
        report.put("durationSec", a.submittedAt() == null ? null : Duration.between(a.startedAt(), a.submittedAt()).toSeconds());
        report.put("chatTurns", turns.size());
        report.put("firstValidMinutes", firstValidMin == null ? null : round1(firstValidMin));
        report.put("total", total);
        report.put("max", Rubric.total());
        report.put("items", items);
        report.put("notes", notes);
        report.putAll(extras);
        long assistantIn = turns.stream().filter(t -> t.inputTokens() != null).mapToLong(ChatTurn::inputTokens).sum();
        long assistantOut = turns.stream().filter(t -> t.outputTokens() != null).mapToLong(ChatTurn::outputTokens).sum();
        Map<String, Object> tokens = new LinkedHashMap<>();
        tokens.put("assistant", Map.of("input", assistantIn, "output", assistantOut));
        tokens.put("r2Replay", Map.of("input", replayIn, "output", replayOut));
        for (Judge j : judges) {
            long[] t = judgeTokens.get(j.name());
            tokens.put("judge_" + j.name(), Map.of("model", j.model(), "input", t[0], "output", t[1], "cachedInput", t[2]));
        }
        report.put("tokens", tokens);
        report.put("transcript", turns.stream().map(t -> Map.of(
                "turn", t.turn(), "role", t.role(), "time", clock(a.startedAt(), t.at()), "text", t.text())).toList());
        store.writeReport(a.id(), report);
        store.save(store.load(a.id()).withStatus(Attempt.Status.DONE));
        logSummary(a, task, total, items);
    }

    // ── 프롬프트 ───────────────────────

    private static final String JUDGE_SYSTEM = """
            당신은 AI 활용 역량 평가의 채점자입니다. 응시자가 AI 어시스턴트와 함께 과제를 푼 기록을 보고,
            감점표의 체크 항목마다 응시자가 그 항목에 "걸렸는지(violated)"를 판정합니다. 점수를 직접 매기지 않습니다.
            규칙:
            - 체크 항목의 판정 기준을 글자 그대로 적용합니다. 애매하면 걸리지 않은 것으로 봅니다(응시자에게 유리하게).
            - violated=true 이면 evidence 에 근거가 된 대화 턴 번호(예: "#T03")나 파일 이름(예: "NOTES.md", "Q2" 같은 후속 질문 번호)을 1개 이상 넣습니다.
            - count 는 '1개당 감점' 항목(D1)에서만 미충족 개수를 넣고, 나머지는 0 입니다.
            - reason 은 응시자에게 보여 줄 한국어 한 문장입니다. 걸리지 않았으면 무엇을 잘했는지 짧게 씁니다.
            - AI 답변이 길거나 정중하다고 유리하게 보지 않습니다. 응시자가 무엇을 지시하고, 검증하고, 결과물에 남겼는지를 봅니다.
            - AI 답변의 ```edit 블록은 파일 수정 제안입니다. 응시자가 [적용]을 누르면 파일에 반영되고, 이벤트 요약에 "aiEdit ... 적용/거절"로 남습니다. 적용한 제안은 응시자가 결과물에 넣은 것으로 보고, 거절한 제안은 채택하지 않은 제안으로 봅니다.
            - 대화 기록에서 "[시스템 오류]"로 표시된 AI 답변은 시스템 문제로 비어 있던 것입니다. 이 턴, 그리고 그 때문에 응시자가 짧게 다시 묻거나 재촉한 질문("?", "다시", "그래서?")은 감점 근거로 쓰지 않습니다.
            """;

    private static final String REPLAY_SYSTEM = """
            같은 요청을 AI 모델에 다시 보냈을 때 나온 답변들이 원래 답변과 "같은 해결책"인지 판정합니다.
            표현, 순서, 변수 이름이 달라도 핵심 진단과 해결 방법이 같으면 same=true 입니다.
            핵심 원인 진단이 다르거나, 제안한 해결 방법이 다르거나, 원래 답변에 있던 핵심 요소가 빠졌으면 same=false 입니다.
            reason 은 한국어 한 문장입니다.
            """;

    /** 응시와 관계없이 같은 앞부분(과제, 숨은 정답, 체크 항목). 프롬프트 캐시로 재사용된다. */
    private String judgePrefix(TaskDef task, List<Check> checks) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 과제\n").append(task.title()).append(" (").append(task.isDev() ? "개발" : "비개발").append(")\n");
        task.description().forEach(d -> sb.append(d).append("\n"));
        sb.append("\n## 요구사항\n");
        task.requirements().forEach(r -> sb.append("- ").append(r).append("\n"));
        if (task.isDev()) {
            sb.append("\n## 숨은 정답 설명 (응시자는 보지 못함)\n")
              .append(tasks.hiddenFiles(task.id()).getOrDefault("answer.md", "")).append("\n");
        }
        if (!task.isDev()) {
            sb.append("\n## 숨은 체크리스트 (응시자는 보지 못함)\n")
              .append(tasks.hiddenFiles(task.id()).getOrDefault("checklist.md", "")).append("\n");
        }
        sb.append("\n# 판정할 체크 항목\n");
        for (Check c : checks) {
            sb.append("- ").append(c.code()).append(": ").append(c.label()).append("\n  판정 기준: ").append(c.judgeHint()).append("\n");
        }
        return sb.toString();
    }

    /** 응시마다 다른 뒷부분(대화, 이벤트, 파일, 후속 답변). */
    private String judgeBody(TaskDef task, List<Check> checks, String transcript, Map<String, String> files,
                             List<String> answers, String events) {
        StringBuilder sb = new StringBuilder();
        sb.append("\n# 대화 기록 (응시자는 AI가 대화창에 붙여 넣은 내용만 볼 수 있다는 것을 안내받았음)\n").append(transcript).append("\n");
        sb.append("# 응시 이벤트 요약 (저장, 빌드, 테스트 실행)\n").append(events).append("\n");
        sb.append("# 최종 제출 파일\n");
        Map<String, String> original = tasks.visibleFiles(task.id());
        files.forEach((path, content) -> {
            if (path.startsWith("logs/") || path.startsWith("자료/")) return;
            boolean changed = !content.equals(original.get(path));
            sb.append("## ").append(path).append(changed ? " (수정됨)" : " (원본 그대로)").append("\n```\n").append(content).append("\n```\n");
        });
        if (!task.isDev()) {
            sb.append("\n# 제공 자료 (수치 대조용)\n");
            files.forEach((path, content) -> {
                if (path.startsWith("자료/")) sb.append("## ").append(path).append("\n```\n").append(content).append("\n```\n");
            });
        }
        sb.append("\n# 후속 질문 답변\n");
        for (int i = 0; i < task.followUps().size(); i++) {
            String ans = answers != null && i < answers.size() ? answers.get(i) : "";
            sb.append("Q").append(i + 1).append(". ").append(task.followUps().get(i)).append("\nA. ").append(ans.isBlank() ? "(무응답)" : ans).append("\n\n");
        }
        sb.append("\n체크 항목마다(").append(String.join(", ", checks.stream().map(Check::code).toList()))
          .append(") code, violated, count, evidence, reason 을 채워 verdicts 배열로 답하세요.");
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

    /** 채점 모델이 검증 흐름(C1, P3)을 볼 수 있게 이벤트를 짧게 요약한다. */
    static String eventSummary(List<JsonNode> events, Instant start) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode e : events) {
            String type = e.path("type").asText();
            if (!type.equals("run") && !type.equals("build") && !type.equals("save") && !type.equals("firstValid") && !type.equals("submit")
                    && !type.equals("aiEdit")) continue;
            String at;
            try {
                at = clock(start, Instant.parse(e.path("at").asText()));
            } catch (RuntimeException ex) {
                at = "?";
            }
            sb.append(at).append(" ").append(type);
            if (type.equals("run")) sb.append(" passed=").append(e.path("passed").asInt()).append(" failed=").append(e.path("failed").asInt())
                    .append(" compiled=").append(e.path("compiled").asBoolean());
            if (type.equals("build")) sb.append(" compiled=").append(e.path("compiled").asBoolean());
            if (type.equals("save")) sb.append(" ").append(e.path("path").asText());
            if (type.equals("aiEdit")) sb.append(" #T").append(pad(e.path("turn").asInt())).append(" 수정 제안 ")
                    .append(e.path("action").asText().equals("apply") ? "적용" : "거절").append(" ").append(e.path("path").asText());
            sb.append("\n");
        }
        return sb.isEmpty() ? "(기록 없음)\n" : sb.toString();
    }

    /**
     * 개발 과제의 첫 유효 결과: src/ 파일을 처음 저장한 뒤, 컴파일되고 테스트가 전부 통과한 첫 실행 시각.
     * 테스트를 추가했는지와는 따로 본다(테스트 추가는 D3 에서만 감점).
     */
    static Instant firstValidFromEvents(List<JsonNode> events) {
        boolean srcChanged = false;
        for (JsonNode e : events) {
            String type = e.path("type").asText();
            if (type.equals("save") && e.path("path").asText().startsWith("src/")) srcChanged = true;
            if (type.equals("run") && srcChanged && e.path("compiled").asBoolean() && e.path("failed").asInt() == 0
                    && e.path("passed").asInt() > 0) {
                try {
                    return Instant.parse(e.path("at").asText());
                } catch (RuntimeException ex) {
                    return null;
                }
            }
        }
        return null;
    }

    /**
     * 두 채점 모델의 판정을 합친다. 둘 다 근거를 대고 걸렸다고 하면 감점(D1 개수는 둘 중 작은 값),
     * 한쪽만 그렇다고 하면 판정 엇갈림(감점 없음). 한쪽 모델만 살아 있으면 그 모델 판정만 쓴다.
     * 판정이 빠진 모델은 "안 걸림"으로 본다(애매하면 응시자에게 유리하게).
     */
    static CheckResult combine(Check c, Map<? extends Judge, Map<String, CheckVerdict>> byJudge) {
        List<JudgeView> views = new ArrayList<>();
        for (var e : byJudge.entrySet()) {
            CheckVerdict v = e.getValue().get(c.code());
            if (v == null) continue;
            views.add(new JudgeView(e.getKey().name(), e.getKey().model(), v.violated(), v.count(),
                    v.evidence() == null ? List.of() : v.evidence(), v.reason()));
        }
        if (views.isEmpty()) {
            return new CheckResult(c.code(), c.label(), "JUDGE", c.points(), 0, "SKIPPED", List.of(), "채점 모델이 판정하지 않음", views);
        }
        List<JudgeView> withEvidence = views.stream().filter(v -> v.violated() && !v.evidence().isEmpty()).toList();
        if (withEvidence.size() == byJudge.size()) {
            int count = withEvidence.stream().mapToInt(v -> Math.max(1, v.count())).min().orElse(1);
            int deducted = c.code().equals("D1") ? Math.min(20, count * c.points()) : c.points();
            List<String> ev = withEvidence.stream().flatMap(v -> v.evidence().stream()).distinct().toList();
            return new CheckResult(c.code(), c.label(), "JUDGE", c.points(), deducted, "DEDUCTED", ev, withEvidence.get(0).reason(), views);
        }
        if (!withEvidence.isEmpty()) {
            JudgeView v = withEvidence.get(0);
            return new CheckResult(c.code(), c.label(), "JUDGE", c.points(), 0, "SPLIT", v.evidence(),
                    "판정 엇갈림: " + v.model() + "만 걸렸다고 봐서 감점하지 않음. " + v.reason(), views);
        }
        var noEvidence = views.stream().filter(JudgeView::violated).findFirst();
        if (noEvidence.isPresent()) {
            return new CheckResult(c.code(), c.label(), "JUDGE", c.points(), 0, "NO_EVIDENCE", List.of(),
                    "근거가 없어 감점하지 않음: " + noEvidence.get().reason(), views);
        }
        List<String> ev = views.stream().flatMap(v -> v.evidence().stream()).distinct().toList();
        return new CheckResult(c.code(), c.label(), "JUDGE", c.points(), 0, "PASSED", ev, views.get(0).reason(), views);
    }

    private static void addTokens(Map<String, long[]> acc, Judge j, Judge.Result<?> r) {
        long[] t = acc.get(j.name());
        t[0] += r.inputTokens();
        t[1] += r.outputTokens();
        t[2] += r.cachedInputTokens();
    }

    // ── 보조 함수 ─────────────────────

    private static Check check(String code, boolean dev) {
        return Rubric.checksFor(dev).stream().filter(c -> c.code().equals(code)).findFirst().orElseThrow();
    }

    private static CheckResult auto(String code, boolean dev, int deducted, String reason) {
        Check c = check(code, dev);
        return new CheckResult(code, c.label(), "AUTO", c.points(), deducted, deducted > 0 ? "DEDUCTED" : "PASSED", List.of(), reason);
    }

    private static CheckResult skipped(String code, boolean dev, String reason) {
        Check c = check(code, dev);
        return new CheckResult(code, c.label(), c.method().name(), c.points(), 0, "SKIPPED", List.of(), reason);
    }

    static String transcript(List<ChatTurn> turns, Instant start) {
        StringBuilder sb = new StringBuilder();
        for (ChatTurn t : turns) {
            String text = "ai".equals(t.role()) && t.text().isBlank()
                    ? "[시스템 오류] AI 답변이 비어 있음 (추론 모델이 출력 한도 안에서 답을 끝내지 못함. 응시자 책임 아님)"
                    : t.text();
            sb.append("#T").append(pad(t.turn())).append(" ").append("user".equals(t.role()) ? "응시자" : "AI")
              .append(" ").append(clock(start, t.at())).append("\n").append(text).append("\n\n");
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

    private void logSummary(Attempt a, TaskDef task, int total, List<ItemResult> items) {
        StringBuilder sb = new StringBuilder("\n========== pAIr 채점 결과 ==========\n");
        sb.append("응시 ").append(a.id()).append(" | ").append(task.title()).append("\n");
        sb.append("총점 ").append(total).append(" / ").append(Rubric.total()).append("\n");
        for (ItemResult it : items) {
            sb.append(String.format("%s %d / %d%n", it.name(), it.score(), it.max()));
            for (CheckResult c : it.checks()) {
                if (c.deducted() > 0) sb.append(String.format("  %s -%d  %s%n", c.code(), c.deducted(), c.reason()));
            }
        }
        sb.append("리포트 파일: ").append(store.dir(a.id()).resolve("report.json")).append("\n");
        sb.append("====================================");
        log.info(sb.toString());
    }
}
