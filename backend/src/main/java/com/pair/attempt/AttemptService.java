package com.pair.attempt;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;

import com.pair.ai.AssistantClient;
import com.pair.attempt.ChatTurn.AssistantRequest;
import com.pair.attempt.ChatTurn.Message;
import com.pair.config.PairProperties;
import com.pair.run.CodeRunner;
import com.pair.scoring.ScoringService;
import com.pair.task.TaskDef;
import com.pair.task.TaskRepository;

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
        // 첫 유효 결과: 응시자가 테스트를 추가했고(원본 테스트 수보다 많고) 모두 통과한 첫 실행.
        // 원본 코드는 보이는 테스트 1개를 이미 통과하므로, 통과만으로는 유효 결과로 보지 않는다.
        int originalTests = (int) tasks.visibleFiles(a.taskId()).entrySet().stream()
                .filter(e -> e.getKey().startsWith("test/"))
                .mapToLong(e -> e.getValue().split("@Test", -1).length - 1).sum();
        if (r.allPassed() && r.passed() > originalTests) markFirstValid(a);
        return r;
    }

    public synchronized List<ChatTurn> chat(String id, String message) {
        Attempt a = requireStatus(id, Attempt.Status.SOLVING);
        List<ChatTurn> history = store.turns(id);
        if (history.size() / 2 >= props.assistant().maxTurns()) {
            throw new IllegalStateException("응시당 AI 질문 한도(" + props.assistant().maxTurns() + "회)에 도달했습니다.");
        }
        List<Message> msgs = new ArrayList<>();
        for (ChatTurn t : history) msgs.add(new Message("user".equals(t.role()) ? "user" : "assistant", t.text()));
        msgs.add(new Message("user", message));
        AssistantRequest req = new AssistantRequest(a.model(), props.assistant().maxOutputTokens(),
                props.assistant().systemPrompt(), List.copyOf(msgs));
        Instant askedAt = Instant.now();
        AssistantClient.Reply reply = assistant.send(req); // 실패하면 예외 → 질문도 저장하지 않는다
        int n = history.size();
        ChatTurn user = new ChatTurn(n + 1, "user", askedAt, message, null, null, null, null, null, null);
        ChatTurn ai = new ChatTurn(n + 2, "ai", Instant.now(), reply.text(), a.provider(), reply.model(), req,
                reply.inputTokens(), reply.outputTokens(), reply.latencyMs());
        store.appendTurn(id, user);
        store.appendTurn(id, ai);
        store.appendEvent(id, "chat", Map.of("turn", ai.turn(), "inputTokens", reply.inputTokens(), "outputTokens", reply.outputTokens()));
        return List.of(user, ai);
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
