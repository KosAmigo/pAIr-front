package com.pair.anticheating;

import static com.pair.anticheating.AntiCheatingModels.*;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pair.config.PairProperties;

@Component
public class AntiCheatingStore {
    private static final String SESSION_ID_PATTERN = "[A-Za-z0-9_-]{1,128}";
    private static final String ID_PATTERN = "[A-Za-z0-9_-]{1,128}";

    private final Path root;
    private final ObjectMapper json;

    @Autowired
    public AntiCheatingStore(PairProperties props, ObjectMapper json) {
        this(Path.of(props.dataDir(), "anti-cheating"), json);
    }

    AntiCheatingStore(Path root, ObjectMapper json) {
        this.root = root.toAbsolutePath();
        this.json = json;
    }

    public synchronized SessionSummary startSession(String sessionId, Settings settings) {
        Path file = fileFor(sessionId);
        if (Files.exists(file)) return summary(read(file));
        SessionData data = new SessionData(sessionId, Instant.now(), null,
                settings == null ? Settings.defaults() : settings, List.of());
        write(file, data);
        return summary(data);
    }

    public synchronized SessionSummary getSession(String sessionId) {
        return summary(read(fileFor(sessionId)));
    }

    public synchronized EventHistory events(String sessionId) {
        SessionData data = read(fileFor(sessionId));
        List<Signal> events = new ArrayList<>();
        List<String> violationIds = new ArrayList<>();
        for (Violation violation : data.violations()) {
            violationIds.add(violation.violationId());
            events.addAll(violation.signals());
        }
        return new EventHistory(events, violationIds);
    }

    public synchronized SessionSummary recordViolation(String sessionId, Violation incoming) {
        validateId(incoming == null ? null : incoming.violationId(), "violationId");
        SessionData data = read(fileFor(sessionId));
        if (data.endedAt() != null) throw new IllegalStateException("종료된 감지 세션에는 사건을 추가할 수 없습니다.");
        if (!data.settings().enabled()) throw new IllegalStateException("비활성화된 감지 세션입니다.");
        if (!sessionId.equals(incoming.sessionId())) throw new IllegalArgumentException("세션 ID가 일치하지 않습니다.");
        if (incoming.occurredAt() == null || incoming.signals().isEmpty()) {
            throw new IllegalArgumentException("사건 발생 시각과 원본 이벤트가 필요합니다.");
        }

        for (Signal signal : incoming.signals()) {
            validateId(signal.signalId(), "signalId");
            if (signal.type() == null || signal.occurredAt() == null) {
                throw new IllegalArgumentException("원본 이벤트 유형과 발생 시각이 필요합니다.");
            }
            if (!data.settings().accepts(signal.type())) {
                throw new IllegalArgumentException("설정에서 비활성화된 이벤트입니다: " + signal.type());
            }
        }

        List<Violation> updated = new ArrayList<>(data.violations());
        int index = -1;
        for (int i = 0; i < updated.size(); i++) {
            if (updated.get(i).violationId().equals(incoming.violationId())) {
                index = i;
                break;
            }
        }
        if (index < 0) {
            updated.add(incoming);
        } else {
            Violation old = updated.get(index);
            updated.set(index, new Violation(old.violationId(), old.sessionId(), old.occurredAt(),
                    mergeSignals(old.signals(), incoming.signals())));
        }

        SessionData next = new SessionData(data.sessionId(), data.startedAt(), data.endedAt(), data.settings(), updated);
        write(fileFor(sessionId), next);
        return summary(next);
    }

    public synchronized SessionSummary finishSession(String sessionId) {
        SessionData data = read(fileFor(sessionId));
        if (data.endedAt() != null) return summary(data);
        SessionData next = new SessionData(data.sessionId(), data.startedAt(), Instant.now(), data.settings(), data.violations());
        write(fileFor(sessionId), next);
        return summary(next);
    }

    private Path fileFor(String sessionId) {
        validateId(sessionId, "sessionId");
        return root.resolve(sessionId).resolve("session.json");
    }

    private static void validateId(String id, String label) {
        if (id == null || !id.matches(ID_PATTERN)) throw new IllegalArgumentException("잘못된 " + label + "입니다.");
    }

    private SessionData read(Path file) {
        if (!Files.exists(file)) throw new NoSuchElementException("없는 감지 세션입니다.");
        try {
            return json.readValue(file.toFile(), SessionData.class);
        } catch (IOException e) {
            throw new IllegalStateException("감지 세션 기록을 읽지 못했습니다.", e);
        }
    }

    private void write(Path file, SessionData data) {
        try {
            Files.createDirectories(file.getParent());
            Path temp = file.resolveSibling("session.json.tmp");
            Files.writeString(temp, json.writerWithDefaultPrettyPrinter().writeValueAsString(data));
            try {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static SessionSummary summary(SessionData data) {
        return new SessionSummary(data.sessionId(), data.startedAt(), data.endedAt(),
                data.violations().size(), data.endedAt() == null);
    }
}
