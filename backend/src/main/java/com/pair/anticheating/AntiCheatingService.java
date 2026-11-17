package com.pair.anticheating;

import static com.pair.anticheating.AntiCheatingModels.*;

import org.springframework.stereotype.Service;

@Service
public class AntiCheatingService {
    private final AntiCheatingStore store;

    public AntiCheatingService(AntiCheatingStore store) {
        this.store = store;
    }

    public SessionSummary start(SessionRequest request) {
        if (request == null) throw new IllegalArgumentException("감지 세션 정보가 필요합니다.");
        return store.startSession(request.sessionId(), request.settings());
    }

    public SessionSummary get(String sessionId) {
        return store.getSession(sessionId);
    }

    public EventHistory events(String sessionId) {
        return store.events(sessionId);
    }

    public SessionSummary record(String sessionId, Violation violation) {
        return store.recordViolation(sessionId, violation);
    }

    public SessionSummary finish(String sessionId) {
        return store.finishSession(sessionId);
    }
}
