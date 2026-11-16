package com.pair.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.pair.config.PairProperties;
import com.pair.grader.GraderService;
import com.pair.grader.PromptStore;
import com.pair.grader.PromptVersion;
import com.pair.scoring.Rubric;

import com.fasterxml.jackson.databind.JsonNode;

/** 채점 툴 API. 로그인 없이 열려 있으므로 실제 서비스에서는 막아야 한다. */
@RestController
@RequestMapping("/api/grader")
public class GraderController {

    private final PromptStore prompts;
    private final GraderService grader;
    private final PairProperties props;

    public GraderController(PromptStore prompts, GraderService grader, PairProperties props) {
        this.prompts = prompts;
        this.grader = grader;
        this.props = props;
    }

    /** 체크 항목 정보 (편집 화면용). key 로 버전의 checks 와 연결한다. */
    public record CheckInfo(String key, String code, String item, String itemName, String track, String method, String label,
                            int defaultPoints, String defaultHint, boolean pointsEditable) {}

    @GetMapping("/rubric")
    public Map<String, Object> rubric() {
        List<CheckInfo> checks = Rubric.CHECKS.stream().map(c -> new CheckInfo(Rubric.key(c), c.code(), c.item(), Rubric.item(c.item()).name(),
                c.track().name().toLowerCase(), c.method().name(), c.label(), c.points(), c.judgeHint(), Rubric.pointsEditable(c))).toList();
        return Map.of("items", Rubric.ITEMS, "checks", checks,
                "defaults", Map.of("judgeRepeat", 1, "parallel", props.grader().parallel()));
    }

    public record VersionRow(String id, String name, String note, java.time.Instant createdAt, String parent, boolean active) {}

    @GetMapping("/versions")
    public List<VersionRow> versions() {
        String active = prompts.activeId();
        return prompts.list().stream().map(v -> new VersionRow(v.id(), v.name(), v.note(), v.createdAt(), v.parent(),
                v.id().equals(active))).toList();
    }

    @GetMapping("/versions/{id}")
    public PromptVersion version(@PathVariable String id) {
        return prompts.get(id);
    }

    @PostMapping("/versions")
    public PromptVersion createVersion(@RequestBody PromptVersion draft) {
        return prompts.create(draft);
    }

    public record ActiveRequest(String id) {}

    @PutMapping("/active")
    public Map<String, String> setActive(@RequestBody ActiveRequest req) {
        prompts.setActive(req.id());
        return Map.of("active", req.id());
    }

    @GetMapping("/attempts")
    public List<GraderService.AttemptRow> attempts() {
        return grader.attempts();
    }

    @PostMapping("/estimate")
    public GraderService.Estimate estimate(@RequestBody GraderService.RunRequest req) {
        return grader.estimate(req);
    }

    public record StartRequest(List<GraderService.AttemptRef> attempts, String versionId, int count, int judgeRepeat, String mode,
                               int batchWaitMinutes) {}

    @PostMapping("/runs")
    public GraderService.RunMeta start(@RequestBody StartRequest req) {
        return grader.start(new GraderService.RunRequest(req.attempts(), req.versionId(), req.count(), req.judgeRepeat(), req.mode(), req.batchWaitMinutes()));
    }

    @GetMapping("/runs")
    public List<GraderService.RunMeta> runs() {
        return grader.runs();
    }

    @GetMapping("/runs/{id}")
    public Map<String, Object> run(@PathVariable String id) {
        return Map.of("meta", grader.meta(id), "results", grader.results(id));
    }

    @PostMapping("/runs/{id}/cancel")
    public GraderService.RunMeta cancel(@PathVariable String id) {
        return grader.cancel(id);
    }

    @GetMapping("/runs/{id}/results/{file}")
    public JsonNode result(@PathVariable String id, @PathVariable String file) {
        return grader.result(id, file);
    }

    @GetMapping("/runs/{id}/export")
    public ResponseEntity<Map<String, Object>> export(@PathVariable String id) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"grader-run-" + id + ".json\"")
                .body(grader.export(id));
    }
}
