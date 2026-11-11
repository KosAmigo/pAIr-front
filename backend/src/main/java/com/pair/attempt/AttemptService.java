package com.pair.attempt;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;

import com.pair.ai.AiUnavailableException;
import com.pair.ai.AssistantClient;
import com.pair.attempt.ChatTurn.AssistantRequest;
import com.pair.attempt.ChatTurn.Message;
import com.pair.config.PairProperties;
import com.pair.run.CodeRunner;
import com.pair.scoring.ScoringService;
import com.pair.task.TaskDef;
import com.pair.task.TaskRepository;

import com.fasterxml.jackson.databind.JsonNode;

@Service
public class AttemptService {

    private static final DateTimeFormatter ID_TIME = DateTimeFormatter.ofPattern("yyMMdd-HHmm").withZone(ZoneId.systemDefault());

    private final AttemptStore store;
    private final TaskRepository tasks;
    private final CodeRunner runner;
    private final AssistantClient assistant;
    private final ScoringService scoring;
    private final PairProperties props;

    public AttemptService(AttemptStore store, TaskRepository tasks, CodeRunner runner,
                          AssistantClient assistant, ScoringService scoring, PairProperties props) {
        this.store = store;
        this.tasks = tasks;
        this.runner = runner;
        this.assistant = assistant;
        this.scoring = scoring;
        this.props = props;
    }

    public Attempt start(String taskId) {
        TaskDef task = tasks.get(taskId);
        Instant now = Instant.now();
        String id = "att-" + ID_TIME.format(now) + "-" + Integer.toString(ThreadLocalRandom.current().nextInt(36 * 36 * 36), 36);
        Attempt a = new Attempt(id, task.id(), props.assistant().provider(), props.assistant().model(),
                now, null, null, null, Attempt.Status.SOLVING, List.of(), null);
        store.create(a, tasks.visibleFiles(task.id()));
        store.appendEvent(id, "start", Map.of("taskId", task.id()));
        return a;
    }

    public void saveFile(String id, String path, String content) {
        Attempt a = requireStatus(id, Attempt.Status.SOLVING);
        store.writeWorkspaceFile(id, path, content);
        store.appendEvent(id, "save", Map.of("path", path, "length", content.length()));
        TaskDef task = tasks.get(a.taskId());
        if (!task.isDev() && path.equals(task.editableFile()) && content.length() >= 300
                && task.requiredHeadings().stream().allMatch(content::contains)
                && sectionsFilled(content, task.requiredHeadings())) {
            markFirstValid(a);
        }
    }

    public CodeRunner.RunResult run(String id) {
        Attempt a = requireStatus(id, Attempt.Status.SOLVING);
        Map<String, String> sources = new HashMap<>();
        store.readFiles(id).forEach((k, v) -> {
            if ((k.startsWith("src/") || k.startsWith("test/")) && k.endsWith(".java")) sources.put(k, v);
        });
        CodeRunner.RunResult r = runner.run(sources);
        Map<String, Object> ev = new HashMap<>(CodeRunner.summary(r));
        store.appendEvent(id, "run", ev);
        // 첫 유효 결과: src 코드를 원본에서 고친 뒤 테스트가 전부 통과한 첫 실행.
        // (원본 코드도 보이는 테스트 1개는 통과하므로 src 변경을 함께 본다. 테스트 추가 여부는 따지지 않는다.)
        Map<String, String> original = tasks.visibleFiles(a.taskId());
        boolean srcChanged = sources.entrySet().stream()
                .anyMatch(e -> e.getKey().startsWith("src/") && !e.getValue().equals(original.get(e.getKey())));
        if (r.allPassed() && srcChanged) markFirstValid(a);
        return r;
    }

    /** 빌드 버튼: 응시자 코드를 컴파일만 한다. */
    public CodeRunner.BuildResult build(String id) {
        requireStatus(id, Attempt.Status.SOLVING);
        Map<String, String> sources = new HashMap<>();
        store.readFiles(id).forEach((k, v) -> {
            if ((k.startsWith("src/") || k.startsWith("test/")) && k.endsWith(".java")) sources.put(k, v);
        });
        CodeRunner.BuildResult r = runner.build(sources);
        store.appendEvent(id, "build", Map.of("compiled", r.compiled(), "diagnostics", r.diagnostics().size(), "millis", r.millis()));
        return r;
    }

    public synchronized List<ChatTurn> chat(String id, String message) {
        Attempt a = requireStatus(id, Attempt.Status.SOLVING);
        int limit = props.assistant().maxInputChars();
        if (limit > 0 && message.length() > limit) {
            throw new IllegalArgumentException("질문은 " + limit + "자 이하로 입력하세요. (현재 " + message.length() + "자)");
        }
        List<ChatTurn> history = store.turns(id);
        if (history.size() / 2 >= props.assistant().maxTurns()) {
            throw new IllegalStateException("응시당 AI 질문 한도(" + props.assistant().maxTurns() + "회)에 도달했습니다.");
        }
        List<Message> msgs = new ArrayList<>();
        for (ChatTurn t : history) msgs.add(new Message("user".equals(t.role()) ? "user" : "assistant", t.text()));
        msgs.add(new Message("user", message));
        String system = props.assistant().systemPrompt() + editGuide(new TreeSet<>(store.readFiles(id).keySet()));
        AssistantRequest req = new AssistantRequest(a.model(), props.assistant().maxOutputTokens(),
                props.assistant().reasoningEffort(), system, List.copyOf(msgs));
        Instant askedAt = Instant.now();
        AssistantClient.Reply reply = assistant.send(req); // 실패하면 예외 → 질문도 저장하지 않는다
        if (reply.text().isBlank()) {
            // 추론 모델이 한도 안에서 답을 끝내지 못하면 빈 답이 온다. 저장하지 않고 다시 보내게 한다.
            store.appendEvent(id, "chatEmpty", Map.of("finishReason", reply.finishReason(), "outputTokens", reply.outputTokens()));
            throw new AiUnavailableException("AI가 답변을 끝내지 못했습니다(" + reply.finishReason()
                    + "). 질문을 조금 나누거나 범위를 좁혀 다시 보내 주세요. 이 실패는 채점에 반영되지 않습니다.");
        }
        int n = history.size();
        ChatTurn user = new ChatTurn(n + 1, "user", askedAt, message, null, null, null, null, null, null);
        ChatTurn ai = new ChatTurn(n + 2, "ai", Instant.now(), reply.text(), a.provider(), reply.model(), req,
                reply.inputTokens(), reply.outputTokens(), reply.latencyMs());
        store.appendTurn(id, user);
        store.appendTurn(id, ai);
        store.appendEvent(id, "chat", Map.of("turn", ai.turn(), "inputTokens", reply.inputTokens(), "outputTokens", reply.outputTokens()));
        return List.of(user, ai);
    }

    // ── AI 수정 제안 ─────────────────────

    /** 어시스턴트에 알려 주는 파일 목록과 수정 제안 형식. 요청 원문(systemPrompt)에 함께 남아 다시 실행(R1)에도 그대로 쓰인다. */
    static String editGuide(java.util.Collection<String> files) {
        return "\n\n" + EDIT_GUIDE + "\n응시자 작업 폴더의 파일: " + String.join(", ", files);
    }

    static final String EDIT_GUIDE = """
            파일을 고치거나 새로 만들자고 제안할 때는 설명 뒤에 아래 형식의 수정 블록을 붙이세요. 응시자가 [적용]을 누르면 파일에 반영되고, [거절]하면 반영되지 않습니다.
            ```edit path=파일 경로
            <<<<<<< SEARCH
            바꿀 원래 내용
            =======
            새 내용
            >>>>>>> REPLACE
            ```
            - SEARCH 에는 응시자가 대화에 붙여 넣은 내용 중 바꿀 줄을 한 글자도 바꾸지 말고 그대로 적습니다. 보지 못한 내용은 지어내지 마세요.
            - 한 블록에 SEARCH/REPLACE 쌍을 여러 개 넣을 수 있습니다. 새 파일을 만들 때는 SEARCH 를 비워 둡니다.
            - 코드를 보여 주기만 할 때는 일반 코드 블록을 씁니다.""";

    /** 화면에 보여 줄 수정 제안. status: PENDING(결정 전), APPLIED(적용), REJECTED(거절). applicable: 지금 파일에 적용할 수 있는지. */
    public record EditView(int index, String path, List<EditProposals.Hunk> hunks, boolean newFile, String status, boolean applicable) {}

    /** 턴 번호별 수정 제안 목록. */
    public Map<Integer, List<EditView>> edits(String id) {
        Map<String, String> files = store.readFiles(id);
        Map<String, String> decided = decisions(store.events(id));
        Map<Integer, List<EditView>> out = new LinkedHashMap<>();
        for (ChatTurn t : store.turns(id)) {
            if (!"ai".equals(t.role())) continue;
            List<EditView> list = new ArrayList<>();
            for (EditProposals.Proposal p : EditProposals.parse(t.text())) {
                String status = decided.getOrDefault(t.turn() + ":" + p.index(), "PENDING");
                boolean ok = !status.equals("APPLIED") && EditProposals.apply(p, files.get(p.path())).isPresent();
                list.add(new EditView(p.index(), p.path(), p.hunks(), p.newFile(), status, ok));
            }
            if (!list.isEmpty()) out.put(t.turn(), list);
        }
        return out;
    }

    /** 결과: 적용했으면 바뀐 파일 내용을 함께 돌려준다. */
    public record EditDecision(String status, String path, String content) {}

    public synchronized EditDecision decideEdit(String id, int turn, int index, boolean apply) {
        requireStatus(id, Attempt.Status.SOLVING);
        ChatTurn t = store.turns(id).stream().filter(x -> x.turn() == turn && "ai".equals(x.role())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("AI 답변 #T" + turn + " 이 없습니다."));
        EditProposals.Proposal p = EditProposals.parse(t.text()).stream().filter(x -> x.index() == index).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("수정 제안을 찾을 수 없습니다."));
        String key = turn + ":" + index;
        String prev = decisions(store.events(id)).get(key);
        if ("APPLIED".equals(prev)) throw new IllegalStateException("이미 적용한 제안입니다.");
        if (!apply) {
            store.appendEvent(id, "aiEdit", Map.of("turn", turn, "index", index, "path", p.path(), "action", "reject"));
            return new EditDecision("REJECTED", p.path(), null);
        }
        Map<String, String> files = store.readFiles(id);
        Optional<String> next = EditProposals.apply(p, files.get(p.path()));
        if (next.isEmpty()) {
            throw new IllegalStateException("지금 파일에서 바꿀 부분을 찾지 못해 적용할 수 없습니다. 코드 보기로 내용을 확인하고 직접 고쳐 주세요.");
        }
        if (!files.containsKey(p.path())) store.createWorkspaceFile(id, p.path());
        store.appendEvent(id, "aiEdit", Map.of("turn", turn, "index", index, "path", p.path(), "action", "apply",
                "newFile", !files.containsKey(p.path())));
        saveFile(id, p.path(), next.get());
        return new EditDecision("APPLIED", p.path(), next.get());
    }

    /** 이벤트에서 "턴:번호" → APPLIED/REJECTED. 거절한 뒤 적용하면 적용으로 본다. */
    static Map<String, String> decisions(List<JsonNode> events) {
        Map<String, String> m = new HashMap<>();
        for (JsonNode e : events) {
            if (!"aiEdit".equals(e.path("type").asText())) continue;
            String key = e.path("turn").asInt() + ":" + e.path("index").asInt();
            if ("APPLIED".equals(m.get(key))) continue;
            m.put(key, "apply".equals(e.path("action").asText()) ? "APPLIED" : "REJECTED");
        }
        return m;
    }

    public Attempt submit(String id) {
        Attempt a = requireStatus(id, Attempt.Status.SOLVING);
        Attempt next = a.withSubmitted(Instant.now());
        store.save(next);
        store.appendEvent(id, "submit", Map.of());
        return next;
    }

    public Attempt followUps(String id, List<String> answers) {
        Attempt a = requireStatus(id, Attempt.Status.FOLLOWUP);
        Attempt next = a.withFollowUps(answers == null ? List.of() : List.copyOf(answers), Instant.now());
        store.save(next);
        store.appendEvent(id, "followups", Map.of("count", next.followUpAnswers().size()));
        scoring.scoreAsync(id);
        return next;
    }

    /** 채점 실패(예: API 키 없음) 뒤 다시 채점. */
    public Attempt rescore(String id) {
        Attempt a = store.load(id);
        if (a.followupsDoneAt() == null) throw new IllegalStateException("후속 질문까지 끝난 응시만 다시 채점할 수 있습니다.");
        Attempt next = a.withStatus(Attempt.Status.SCORING);
        store.save(next);
        scoring.scoreAsync(id);
        return next;
    }

    private void markFirstValid(Attempt a) {
        if (a.firstValidAt() != null) return;
        store.save(a.withFirstValid(Instant.now()));
        store.appendEvent(a.id(), "firstValid", Map.of());
    }

    private Attempt requireStatus(String id, Attempt.Status status) {
        Attempt a = store.load(id);
        if (a.status() != status) {
            throw new IllegalStateException("지금 단계(" + a.status() + ")에서는 할 수 없는 요청입니다.");
        }
        return a;
    }

    /** 필수 제목 아래에 내용이 한 줄 이상 있는지. */
    static boolean sectionsFilled(String doc, List<String> headings) {
        for (String h : headings) {
            int at = doc.indexOf(h);
            if (at < 0) return false;
            int lineEnd = doc.indexOf('\n', at);
            if (lineEnd < 0) return false;
            int next = doc.indexOf("\n#", lineEnd);
            String body = doc.substring(lineEnd, next < 0 ? doc.length() : next).trim();
            if (body.isEmpty()) return false;
        }
        return true;
    }
}
