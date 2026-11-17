package com.pair.anticheating;

import static com.pair.anticheating.AntiCheatingModels.*;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/anti-cheating")
public class AntiCheatingController {
    private final AntiCheatingService service;

    public AntiCheatingController(AntiCheatingService service) {
        this.service = service;
    }

    @PostMapping("/sessions")
    public SessionSummary start(@RequestBody SessionRequest request) {
        return service.start(request);
    }

    @GetMapping("/sessions/{sessionId}")
    public SessionSummary get(@PathVariable String sessionId) {
        return service.get(sessionId);
    }

    @GetMapping("/sessions/{sessionId}/events")
    public EventHistory events(@PathVariable String sessionId) {
        return service.events(sessionId);
    }

    @PostMapping("/sessions/{sessionId}/violations")
    public SessionSummary record(@PathVariable String sessionId, @RequestBody Violation violation) {
        return service.record(sessionId, violation);
    }

    @PostMapping("/sessions/{sessionId}/finish")
    public SessionSummary finish(@PathVariable String sessionId) {
        return service.finish(sessionId);
    }
}
