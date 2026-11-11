package com.pair.attempt;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.TreeMap;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

import com.pair.config.PairProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * 응시 기록을 JSON 파일로 저장한다.
 * pilot-data/attempts/{id}/ 아래에 attempt.json, turns.jsonl, events.jsonl, workspace/, snapshots/, report.json
 */
@Component
public class AttemptStore {

    private final Path root;
    private final JsonMapper json;
    private final JsonMapper pretty;

    public AttemptStore(PairProperties props, JsonMapper json) {
        this.root = Path.of(props.dataDir(), "attempts").toAbsolutePath();
        this.json = json;
        this.pretty = json.rebuild().enable(SerializationFeature.INDENT_OUTPUT).build();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public Path root() {
        return root;
    }

    public Path dir(String id) {
        if (!id.matches("[a-z0-9-]+")) throw new IllegalArgumentException("잘못된 응시 ID: " + id);
        return root.resolve(id);
    }

    public Path workspace(String id) {
        return dir(id).resolve("workspace");
    }

    public synchronized void create(Attempt a, Map<String, String> files) {
        try {
            Path ws = workspace(a.id());
            Files.createDirectories(ws);
            for (var e : files.entrySet()) writeFile(ws, e.getKey(), e.getValue());
            save(a);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public synchronized void save(Attempt a) {
        writeJson(dir(a.id()).resolve("attempt.json"), a);
    }

    public Attempt load(String id) {
        Path p = dir(id).resolve("attempt.json");
        if (!Files.exists(p)) throw new NoSuchElementException("없는 응시입니다: " + id);
        try {
            return json.readValue(p.toFile(), Attempt.class);
        } catch (RuntimeException e) {
            throw new IllegalStateException("응시 기록을 읽지 못했습니다: " + id, e);
        }
    }

    // ── 파일 ─────────────────────────────

    public Map<String, String> readFiles(String id) {
        Path ws = workspace(id);
        Map<String, String> out = new TreeMap<>();
        try (Stream<Path> s = Files.walk(ws)) {
            for (Path p : s.filter(Files::isRegularFile).toList()) {
                out.put(ws.relativize(p).toString().replace('\\', '/'), Files.readString(p, StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }

    public synchronized void writeWorkspaceFile(String id, String rel, String content) {
        try {
            Path ws = workspace(id);
            Path target = ws.resolve(rel).normalize();
            if (!target.startsWith(ws) || !Files.exists(target)) {
                throw new IllegalArgumentException("수정할 수 없는 파일입니다: " + rel);
            }
            Files.writeString(target, content, StandardCharsets.UTF_8);
            // 저장할 때마다 스냅샷을 남긴다 (D3, R2 분석용)
            Path snap = dir(id).resolve("snapshots").resolve(Instant.now().toEpochMilli() + "_" + rel.replace("/", "__"));
            Files.createDirectories(snap.getParent());
            Files.writeString(snap, content, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void writeFile(Path ws, String rel, String content) throws IOException {
        Path target = ws.resolve(rel).normalize();
        if (!target.startsWith(ws)) throw new IllegalArgumentException(rel);
        Files.createDirectories(target.getParent());
        Files.writeString(target, content, StandardCharsets.UTF_8);
    }

    // ── 대화 턴, 이벤트 ─────────────────

    public synchronized void appendTurn(String id, ChatTurn turn) {
        appendLine(dir(id).resolve("turns.jsonl"), json.writeValueAsString(turn));
    }

    public List<ChatTurn> turns(String id) {
        return readLines(dir(id).resolve("turns.jsonl"), ChatTurn.class);
    }

    public synchronized void appendEvent(String id, String type, Map<String, Object> data) {
        Map<String, Object> e = new TreeMap<>(data);
        e.put("type", type);
        e.put("at", Instant.now().toString());
        appendLine(dir(id).resolve("events.jsonl"), json.writeValueAsString(e));
    }

    public List<JsonNode> events(String id) {
        return readLines(dir(id).resolve("events.jsonl"), JsonNode.class);
    }

    // ── 리포트 ─────────────────────────

    public void writeReport(String id, Object report) {
        writeJson(dir(id).resolve("report.json"), report);
    }

    public JsonNode readReport(String id) {
        Path p = dir(id).resolve("report.json");
        if (!Files.exists(p)) return null;
        return json.readTree(p.toFile());
    }

    /** 채점 중간 산출물(R2 다시 실행 결과 등)을 남긴다. */
    public void writeArtifact(String id, String name, Object value) {
        writeJson(dir(id).resolve(name), value);
    }

    // ── 내부 ───────────────────────────

    private void writeJson(Path p, Object v) {
        try {
            Files.createDirectories(p.getParent());
            Files.writeString(p, pretty.writeValueAsString(v), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void appendLine(Path p, String line) {
        try {
            Files.createDirectories(p.getParent());
            Files.writeString(p, line + "\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private <T> List<T> readLines(Path p, Class<T> type) {
        List<T> out = new ArrayList<>();
        if (!Files.exists(p)) return out;
        try {
            for (String line : Files.readAllLines(p, StandardCharsets.UTF_8)) {
                if (!line.isBlank()) out.add(json.readValue(line, type));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }
}
