package com.pair.web;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.pair.attempt.Attempt;
import com.pair.attempt.AttemptService;
import com.pair.attempt.AttemptStore;
import com.pair.attempt.ChatTurn;
import com.pair.run.CodeRunner;
import com.pair.task.TaskDef;
import com.pair.task.TaskRepository;

import com.fasterxml.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final TaskRepository tasks;
    private final AttemptService attempts;
    private final AttemptStore store;
    private final com.pair.config.PairProperties props;

    public ApiController(TaskRepository tasks, AttemptService attempts, AttemptStore store, com.pair.config.PairProperties props) {
        this.tasks = tasks;
        this.attempts = attempts;
        this.store = store;
        this.props = props;
    }

    public record StartRequest(String taskId) {}

    public record SaveRequest(String content) {}

    public record ChatRequest(String message) {}

    public record FollowUpRequest(List<String> answers) {}

    public record TurnView(int turn, String role, String time, String text, List<AttemptService.EditView> edits) {}

    public record EditRequest(int turn, int index, String action) {}

    @GetMapping("/tasks/{taskId}")
    public TaskDef task(@PathVariable String taskId) {
        return tasks.get(taskId);
    }

    @PostMapping("/attempts")
    public Map<String, Object> start(@RequestBody StartRequest req) {
        Attempt a = attempts.start(req.taskId());
        return Map.of("attemptId", a.id());
    }

    /** 내 기록: 실제 응시 목록 (최근 순). 채점이 끝난 응시는 항목 점수를 함께 준다. */
    @GetMapping("/attempts")
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        try (var dirs = java.nio.file.Files.list(store.root())) {
            for (var dir : dirs.filter(java.nio.file.Files::isDirectory).toList()) {
                Attempt a;
                try {
                    a = store.load(dir.getFileName().toString());
                } catch (RuntimeException e) {
                    continue;
                }
                if (isEmpty(a)) continue; // 응시 화면에 들어갔다 아무것도 안 하고 나간 기록은 보여 주지 않는다
                TaskDef task = tasks.get(a.taskId());
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", a.id());
                m.put("taskId", task.id());
                m.put("taskTitle", task.title());
                m.put("taskType", task.type());
                m.put("startedAt", a.startedAt());
                m.put("status", a.status());
                if (a.status() == Attempt.Status.DONE) {
                    JsonNode r = store.readReport(a.id());
                    if (r != null) {
                        // version 2(감점식)만 총점이 있다. 이전 형식은 다시 채점해야 한다.
                        m.put("total", r.path("version").asInt() >= 2 ? r.path("total").asInt() : null);
                        m.put("legacyReport", r.path("version").asInt() < 2);
                        for (JsonNode it : r.path("items")) {
                            JsonNode sc = it.path("score");
                            m.put(it.path("key").asText(), sc.isNumber() ? sc.asDouble() : null);
                        }
                    }
                }
                out.add(m);
            }
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
        out.sort((x, y) -> String.valueOf(y.get("startedAt")).compareTo(String.valueOf(x.get("startedAt"))));
        return out;
    }

    /** 빈 응시: 풀이 중이고, AI 질문도, 파일 저장, 빌드, 실행도 없는 기록. */
    private boolean isEmpty(Attempt a) {
        if (a.status() != Attempt.Status.SOLVING) return false;
        if (!store.turns(a.id()).isEmpty()) return false;
        return store.events(a.id()).stream().allMatch(e -> "start".equals(e.path("type").asText()));
    }

    @GetMapping("/attempts/{id}")
    public Map<String, Object> attempt(@PathVariable String id) {
        Attempt a = store.load(id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("attempt", a);
        m.put("task", tasks.get(a.taskId()));
        m.put("files", store.readFiles(id).keySet());
        var edits = attempts.edits(id);
        m.put("turns", store.turns(id).stream().map(t -> view(a, t, edits.getOrDefault(t.turn(), List.of()))).toList());
        m.put("chatMaxChars", props.assistant().maxInputChars());
        m.put("elapsedSeconds", Duration.between(a.startedAt(), a.submittedAt() != null ? a.submittedAt() : Instant.now()).toSeconds());
        return m;
    }

    @GetMapping("/attempts/{id}/file")
    public Map<String, String> file(@PathVariable String id, @RequestParam String path) {
        String content = store.readFiles(id).get(path);
        if (content == null) throw new java.util.NoSuchElementException("없는 파일입니다: " + path);
        return Map.of("path", path, "content", content);
    }

    @PutMapping("/attempts/{id}/file")
    public Map<String, Object> save(@PathVariable String id, @RequestParam String path, @RequestBody SaveRequest req) {
        attempts.saveFile(id, path, req.content() == null ? "" : req.content());
        return Map.of("saved", true);
    }

    @PostMapping("/attempts/{id}/build")
    public CodeRunner.BuildResult build(@PathVariable String id) {
        return attempts.build(id);
    }

    @PostMapping("/attempts/{id}/run")
    public CodeRunner.RunResult run(@PathVariable String id) {
        return attempts.run(id);
    }

    @PostMapping("/attempts/{id}/chat")
    public List<TurnView> chat(@PathVariable String id, @RequestBody ChatRequest req) {
        if (req.message() == null || req.message().isBlank()) throw new IllegalArgumentException("메시지가 비어 있습니다.");
        Attempt a = store.load(id);
        List<ChatTurn> added = attempts.chat(id, req.message());
        var edits = attempts.edits(id);
        return added.stream().map(t -> view(a, t, edits.getOrDefault(t.turn(), List.of()))).toList();
    }

    private final java.util.concurrent.ExecutorService streams = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor();

    /**
     * 채팅 스트리밍 (Server-Sent Events). 답변 글자가 오는 대로 "delta" 이벤트로 보내고,
     * 다 받아 기록에 저장한 뒤 "done" 이벤트로 새 턴 2개(질문, 답변)를 보낸다. 실패하면 "error" 이벤트.
     */
    @PostMapping(value = "/attempts/{id}/chat/stream", produces = org.springframework.http.MediaType.TEXT_EVENT_STREAM_VALUE)
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter chatStream(@PathVariable String id, @RequestBody ChatRequest req) {
        if (req.message() == null || req.message().isBlank()) throw new IllegalArgumentException("메시지가 비어 있습니다.");
        Attempt a = store.load(id);
        var emitter = new org.springframework.web.servlet.mvc.method.annotation.SseEmitter(6 * 60 * 1000L);
        streams.submit(() -> {
            try {
                List<ChatTurn> added = attempts.chat(id, req.message(), delta -> {
                    try {
                        emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter.event().name("delta").data(Map.of("t", delta)));
                    } catch (java.io.IOException e) {
                        throw new java.io.UncheckedIOException(e); // 응시자가 화면을 닫으면 받기를 멈춘다
                    }
                });
                var edits = attempts.edits(id);
                emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter.event().name("done")
                        .data(added.stream().map(t -> view(a, t, edits.getOrDefault(t.turn(), List.of()))).toList()));
                emitter.complete();
            } catch (Exception e) {
                try {
                    String msg = e.getMessage() == null ? e.toString() : e.getMessage();
                    emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter.event().name("error").data(Map.of("message", msg)));
                    emitter.complete();
                } catch (Exception ignored) {
                    emitter.completeWithError(e);
                }
            }
        });
        return emitter;
    }

    /** AI 수정 제안 적용(apply) 또는 거절(reject). */
    @PostMapping("/attempts/{id}/edits")
    public AttemptService.EditDecision decideEdit(@PathVariable String id, @RequestBody EditRequest req) {
        if (!"apply".equals(req.action()) && !"reject".equals(req.action())) throw new IllegalArgumentException("action 은 apply 또는 reject 입니다.");
        return attempts.decideEdit(id, req.turn(), req.index(), "apply".equals(req.action()));
    }

    @PostMapping("/attempts/{id}/submit")
    public Attempt submit(@PathVariable String id) {
        return attempts.submit(id);
    }

    @PostMapping("/attempts/{id}/followups")
    public Attempt followUps(@PathVariable String id, @RequestBody FollowUpRequest req) {
        return attempts.followUps(id, req.answers());
    }

    @PostMapping("/attempts/{id}/rescore")
    public Attempt rescore(@PathVariable String id) {
        return attempts.rescore(id);
    }

    @GetMapping("/attempts/{id}/report")
    public Map<String, Object> report(@PathVariable String id) {
        Attempt a = store.load(id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", a.status());
        m.put("error", a.error());
        JsonNode report = a.status() == Attempt.Status.DONE ? store.readReport(id) : null;
        m.put("report", report);
        return m;
    }

    private static TurnView view(Attempt a, ChatTurn t, List<AttemptService.EditView> edits) {
        long s = Math.max(0, Duration.between(a.startedAt(), t.at()).toSeconds());
        return new TurnView(t.turn(), t.role(), String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60), t.text(), edits);
    }
}
