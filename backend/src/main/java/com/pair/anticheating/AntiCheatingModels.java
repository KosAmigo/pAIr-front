package com.pair.anticheating;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public final class AntiCheatingModels {
    private AntiCheatingModels() {}

    public enum SignalType { MOUSE_LEAVE, WINDOW_BLUR, TAB_HIDDEN, FULLSCREEN_EXIT }

    public record Settings(boolean enabled, Map<SignalType, Boolean> signals) {
        public Settings {
            EnumMap<SignalType, Boolean> normalized = new EnumMap<>(SignalType.class);
            if (signals != null) normalized.putAll(signals);
            for (SignalType type : SignalType.values()) normalized.putIfAbsent(type, false);
            signals = Map.copyOf(normalized);
        }

        public static Settings defaults() {
            EnumMap<SignalType, Boolean> signals = new EnumMap<>(SignalType.class);
            for (SignalType type : SignalType.values()) signals.put(type, true);
            return new Settings(true, signals);
        }

        public boolean accepts(SignalType type) {
            return enabled && signals.getOrDefault(type, false);
        }
    }

    public record Signal(String signalId, SignalType type, Instant occurredAt) {}

    public record Violation(String violationId, String sessionId, Instant occurredAt, List<Signal> signals) {
        public Violation {
            signals = signals == null ? List.of() : List.copyOf(signals);
        }
    }

    public record SessionData(
            String sessionId,
            Instant startedAt,
            Instant endedAt,
            Settings settings,
            List<Violation> violations) {
        public SessionData {
            settings = settings == null ? Settings.defaults() : settings;
            violations = violations == null ? List.of() : List.copyOf(violations);
        }
    }

    public record SessionRequest(String sessionId, Settings settings) {}

    public record SessionSummary(
            String sessionId,
            Instant startedAt,
            Instant endedAt,
            int violationCount,
            boolean active) {}

    public record EventHistory(List<Signal> events, List<String> violationIds) {
        public EventHistory {
            events = events == null ? List.of() : List.copyOf(events);
            violationIds = violationIds == null ? List.of() : List.copyOf(violationIds);
        }
    }

    public static List<Signal> mergeSignals(List<Signal> current, List<Signal> incoming) {
        Map<String, Signal> merged = new java.util.LinkedHashMap<>();
        for (Signal signal : current) merged.put(signal.signalId(), signal);
        for (Signal signal : incoming) merged.putIfAbsent(signal.signalId(), signal);
        return new ArrayList<>(merged.values());
    }
}
