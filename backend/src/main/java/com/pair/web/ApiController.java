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

import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final TaskRepository tasks;
    private final AttemptService attempts;
    private final AttemptStore store;

    public ApiController(TaskRepository tasks, AttemptService attempts, AttemptStore store) {
        this.tasks = tasks;
        this.attempts = attempts;
        this.store = store;
    }

    public record StartRequest(String taskId) {}

    public record SaveRequest(String content) {}

    public record ChatRequest(String message) {}

    public record FollowUpRequest(List<String> answers) {}

    public record TurnView(int turn, String role, String time, String text) {}

    @GetMapping("/tasks/{taskId}")
    public TaskDef task(@PathVariable String taskId) {
        return tasks.get(taskId);
    }

    @PostMapping("/attempts")
    public Map<String, Object> start(@RequestBody StartRequest req) {
        Attempt a = attempts.start(req.taskId());
        return Map.of("attemptId", a.id());
    }

    @GetMapping("/attempts/{id}")
    public Map<String, Object> attempt(@PathVariable String id) {
        Attempt a = store.load(id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("attempt", a);
        m.put("task", tasks.get(a.taskId()));
        m.put("files", store.readFiles(id).keySet());
        m.put("turns", store.turns(id).stream().map(t -> view(a, t)).toList());
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

    @PostMapping("/attempts/{id}/run")
    public CodeRunner.RunResult run(@PathVariable String id) {
        return attempts.run(id);
    }

    @PostMapping("/attempts/{id}/chat")
    public List<TurnView> chat(@PathVariable String id, @RequestBody ChatRequest req) {
        if (req.message() == null || req.message().isBlank()) throw new IllegalArgumentException("메시지가 비어 있습니다.");
        Attempt a = store.load(id);
        return attempts.chat(id, req.message()).stream().map(t -> view(a, t)).toList();
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

    private static TurnView view(Attempt a, ChatTurn t) {
        long s = Math.max(0, Duration.between(a.startedAt(), t.at()).toSeconds());
        return new TurnView(t.turn(), t.role(), String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60), t.text());
    }
}
