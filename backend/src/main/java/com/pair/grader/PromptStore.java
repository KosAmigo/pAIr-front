package com.pair.grader;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.pair.config.PairProperties;
import com.pair.scoring.Rubric;
import com.pair.scoring.ScoringPrompts;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

/**
 * 채점 프롬프트 버전 저장소.
 * - 버전: grader/versions/{id}.json (git 으로 공유. 한 번 저장한 버전은 고치지 않고 새 버전으로 저장)
 * - 실제 채점에 쓸 버전: pilot-data/grader/active.txt (각자 PC 에만)
 */
@Component
public class PromptStore {

    private static final Logger log = LoggerFactory.getLogger(PromptStore.class);
    public static final String DEFAULT_ID = "v1_기본";
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").withZone(ZoneId.of("Asia/Seoul"));

    private final Path dir;
    private final Path activeFile;
    private final ObjectMapper json;
    private final ObjectMapper pretty;

    public PromptStore(PairProperties props, ObjectMapper json) {
        this.dir = Path.of(props.grader().dir(), "versions").toAbsolutePath();
        this.activeFile = Path.of(props.dataDir(), "grader", "active.txt").toAbsolutePath();
        this.json = json;
        this.pretty = json.copy().enable(SerializationFeature.INDENT_OUTPUT);
        try {
            Files.createDirectories(dir);
            if (!Files.exists(file(DEFAULT_ID))) write(builtin());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 코드 기본값으로 만든 버전 (v1_기본). */
    public static PromptVersion builtin() {
        Map<String, PromptVersion.CheckPrompt> checks = new LinkedHashMap<>();
        for (Rubric.Check c : Rubric.CHECKS) checks.put(Rubric.key(c), new PromptVersion.CheckPrompt(c.judgeHint(), c.points()));
        return new PromptVersion(DEFAULT_ID, "기본", "system", "코드에 있던 채점 프롬프트와 배점", Instant.parse("2026-11-12T00:00:00Z"), null,
                ScoringPrompts.JUDGE_SYSTEM, ScoringPrompts.REPLAY_SYSTEM, checks);
    }

    public List<PromptVersion> list() {
        List<PromptVersion> out = new ArrayList<>();
        try (Stream<Path> s = Files.list(dir)) {
            for (Path p : s.filter(f -> f.toString().endsWith(".json")).toList()) {
                try {
                    out.add(json.readValue(p.toFile(), PromptVersion.class));
                } catch (IOException | RuntimeException e) {
                    log.warn("프롬프트 버전 파일을 읽지 못했습니다: {} ({})", p.getFileName(), e.getMessage());
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        out.sort(Comparator.comparing(PromptVersion::createdAt, Comparator.nullsFirst(Comparator.naturalOrder())));
        return out;
    }

    public PromptVersion get(String id) {
        Path p = file(id);
        if (!Files.exists(p)) throw new NoSuchElementException("없는 프롬프트 버전입니다: " + id);
        try {
            return json.readValue(p.toFile(), PromptVersion.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 새 버전 저장. id 는 "날짜-시각_작성자_이름" 이라 여러 명이 동시에 만들어도 파일이 겹치지 않는다. */
    public synchronized PromptVersion create(PromptVersion draft) {
        String name = clean(draft.name());
        String author = clean(draft.author());
        if (name.isEmpty()) throw new IllegalArgumentException("버전 이름을 입력하세요.");
        if (author.isEmpty()) throw new IllegalArgumentException("작성자 이름을 입력하세요.");
        if (draft.judgeSystem() == null || draft.judgeSystem().isBlank()) throw new IllegalArgumentException("공통 채점 규칙이 비어 있습니다.");
        if (draft.replaySystem() == null || draft.replaySystem().isBlank()) throw new IllegalArgumentException("R1 비교 프롬프트가 비어 있습니다.");
        Instant now = Instant.now();
        String base = STAMP.format(now) + "_" + author + "_" + name;
        String id = base;
        for (int i = 2; Files.exists(file(id)); i++) id = base + "-" + i;
        Map<String, PromptVersion.CheckPrompt> checks = new LinkedHashMap<>();
        for (Rubric.Check c : Rubric.CHECKS) {
            String k = Rubric.key(c);
            PromptVersion.CheckPrompt p = draft.checks() == null ? null : draft.checks().get(k);
            int points = c.points(); // 배점은 고정: 보낸 값과 관계없이 기준표 배점을 저장
            String hint = c.method() == Rubric.Method.JUDGE ? (p == null || p.hint() == null || p.hint().isBlank() ? c.judgeHint() : p.hint().trim()) : null;
            checks.put(k, new PromptVersion.CheckPrompt(hint, points));
        }
        PromptVersion v = new PromptVersion(id, draft.name().trim(), draft.author().trim(), draft.note() == null ? "" : draft.note().trim(),
                now, draft.parent(), draft.judgeSystem().trim(), draft.replaySystem().trim(), checks);
        write(v);
        return v;
    }

    public String activeId() {
        try {
            if (Files.exists(activeFile)) {
                String id = Files.readString(activeFile, StandardCharsets.UTF_8).trim();
                if (!id.isEmpty() && Files.exists(file(id))) return id;
            }
        } catch (IOException | IllegalArgumentException e) {
            log.warn("실제 채점 버전 설정을 읽지 못해 기본 버전을 씁니다: {}", e.getMessage());
        }
        return DEFAULT_ID;
    }

    /** 실제 응시 채점에 쓸 버전. */
    public PromptVersion active() {
        try {
            return get(activeId());
        } catch (RuntimeException e) {
            return builtin();
        }
    }

    public void setActive(String id) {
        get(id); // 있는지 확인
        try {
            Files.createDirectories(activeFile.getParent());
            Files.writeString(activeFile, id, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Path file(String id) {
        if (id == null || !id.matches("[0-9A-Za-z가-힣_\\-]+")) throw new IllegalArgumentException("잘못된 버전 ID: " + id);
        return dir.resolve(id + ".json");
    }

    private void write(PromptVersion v) {
        try {
            Files.writeString(file(v.id()), pretty.writeValueAsString(v), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 파일 이름에 쓸 수 있게 한글, 영문, 숫자, -, _ 만 남기고 공백은 - 로. */
    static String clean(String s) {
        if (s == null) return "";
        String t = s.trim().replaceAll("\\s+", "-").replaceAll("[^0-9A-Za-z가-힣_\\-]", "");
        return t.length() > 30 ? t.substring(0, 30) : t;
    }
}
