package com.pair.anticheating;

import static com.pair.anticheating.AntiCheatingModels.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;

class AntiCheatingStoreTest {
    @TempDir
    Path tempDir;

    private ObjectMapper json;
    private AntiCheatingStore store;
    private final Instant occurredAt = Instant.parse("2026-11-17T10:00:00Z");

    @BeforeEach
    void setUp() {
        json = new ObjectMapper().findAndRegisterModules();
        store = new AntiCheatingStore(tempDir, json);
    }

    @Test
    void persistsSessionAndDerivesCountFromUniqueViolations() {
        store.startSession("att-1", Settings.defaults());
        Violation first = violation("att-1", "v-1", List.of(signal("s-1", SignalType.MOUSE_LEAVE)));
        assertEquals(1, store.recordViolation("att-1", first).violationCount());

        // 같은 위반 재전송은 카운트를 늘리지 않고 새 원본 신호만 덧붙인다.
        Violation retry = violation("att-1", "v-1", List.of(
                signal("s-1", SignalType.MOUSE_LEAVE),
                signal("s-2", SignalType.WINDOW_BLUR)));
        assertEquals(1, store.recordViolation("att-1", retry).violationCount());

        AntiCheatingStore reloaded = new AntiCheatingStore(tempDir, json);
        assertEquals(1, reloaded.getSession("att-1").violationCount());
        EventHistory history = reloaded.events("att-1");
        assertEquals(List.of("v-1"), history.violationIds());
        assertEquals(2, history.events().size());
    }

    @Test
    void returnThenNewViolationIncrementsCountAndFinishedSessionRejectsEvents() {
        store.startSession("att-2", Settings.defaults());
        store.recordViolation("att-2", violation("att-2", "v-1", List.of(signal("s-1", SignalType.TAB_HIDDEN))));
        assertEquals(2, store.recordViolation("att-2",
                violation("att-2", "v-2", List.of(signal("s-2", SignalType.MOUSE_LEAVE)))).violationCount());

        SessionSummary ended = store.finishSession("att-2");
        assertFalse(ended.active());
        assertNotNull(ended.endedAt());
        assertThrows(IllegalStateException.class, () -> store.recordViolation("att-2",
                violation("att-2", "v-3", List.of(signal("s-3", SignalType.WINDOW_BLUR)))));
        assertEquals(2, store.getSession("att-2").violationCount());
    }

    @Test
    void rejectsSignalsDisabledForTheSession() {
        Settings settings = new Settings(true, Map.of(SignalType.MOUSE_LEAVE, false));
        store.startSession("att-3", settings);
        assertThrows(IllegalArgumentException.class, () -> store.recordViolation("att-3",
                violation("att-3", "v-1", List.of(signal("s-1", SignalType.MOUSE_LEAVE)))));
    }

    private Violation violation(String sessionId, String id, List<Signal> signals) {
        return new Violation(id, sessionId, occurredAt, signals);
    }

    private Signal signal(String id, SignalType type) {
        return new Signal(id, type, occurredAt);
    }
}
