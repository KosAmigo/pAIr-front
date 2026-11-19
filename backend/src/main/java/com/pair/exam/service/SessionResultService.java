package com.pair.exam.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalDouble;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.pair.attempt.Attempt;
import com.pair.attempt.AttemptStore;
import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.domain.ProctorEvent;
import com.pair.exam.repository.ExamParticipantRepository;
import com.pair.exam.repository.ProctorEventRepository;

/**
 * 회차 결과 분석: 점수 분포, 순위, 역량(채점 항목)별 평균, 상·하위 비교, 감독 이벤트 요약, 포트폴리오 지표.
 * 점수는 팀원 1 채점 결과(report.json)를 읽기만 한다. 채점이 안 끝난 응시자는 점수 없이 나온다.
 * DB 조회는 대상자 1번 + 이벤트 집계 1번 + 사진 용량 합 1번 (대상자 수만큼 반복 조회하지 않는다).
 */
@Service
public class SessionResultService {
    private static final Logger log = LoggerFactory.getLogger(SessionResultService.class);

    /** 영상 스트리밍으로 감독했다면 보냈을 양 (cam-proctor 전송량 패널과 같은 가정) */
    static final long VIDEO_BITS_PER_SECOND = 1_500_000;
    private static final int BUCKET = 10;
    /** 상위·하위 비교 비율 */
    private static final double TOP_RATIO = 0.25;

    public enum State { NOT_ENTERED, WAITING, SOLVING, SUBMITTED }

    public record Row(int rank, Long participantId, String name, String email, State state, Instant enteredAt,
            Instant startedAt, Instant submittedAt, ExamParticipant.SubmitKind submitKind, Integer score, Integer maxScore,
            Map<String, Integer> items, Map<ProctorEvent.Type, Long> events) {}

    public record Bucket(int from, int to, int count) {}

    public record Metrics(
            /** 자동 제출 처리 시각 - 종료 시각 (서버 시각 기준, 공정성 지표) */
            Long autoSubmitLagMs,
            long snapshotBytes,
            /** 시험 시간 동안 영상 스트리밍으로 보냈을 양 (응시 시작한 인원 기준) */
            long videoBytesEstimate,
            Double savedRatio) {}

    public record Result(Long sessionId, String title, ExamSession.Phase phase, int participants, int started,
            int submitted, int scored, Double average, List<Bucket> distribution, Map<String, Double> itemAverages,
            Map<String, Double> topItemAverages, Map<String, Double> bottomItemAverages,
            Map<ProctorEvent.Type, Long> eventTotals, Metrics metrics, List<Row> rows) {}

    private final ExamSessionService sessions;
    private final ExamParticipantRepository participants;
    private final ProctorEventRepository events;
    private final AttemptStore attempts;
    private final Clock clock;

    public SessionResultService(ExamSessionService sessions, ExamParticipantRepository participants,
            ProctorEventRepository events, AttemptStore attempts, Clock clock) {
        this.sessions = sessions;
        this.participants = participants;
        this.events = events;
        this.attempts = attempts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Result result(Long sessionId) {
        Instant now = clock.instant();
        ExamSession s = sessions.require(sessionId);
        List<ExamParticipant> ps = participants.findBySessionIdOrderByIdAsc(sessionId);
        List<Long> ids = ps.stream().map(ExamParticipant::getId).toList();
        Map<Long, Map<ProctorEvent.Type, Long>> eventCounts = eventCounts(ids);

        List<Row> rows = new ArrayList<>();
        for (ExamParticipant p : ps) {
            Score sc = score(p);
            rows.add(new Row(0, p.getId(), p.getName(), p.getEmail(), state(p), p.getEnteredAt(), p.getStartedAt(),
                    p.getSubmittedAt(), p.getSubmitKind(), sc.total, sc.max, sc.items,
                    eventCounts.getOrDefault(p.getId(), Map.of())));
        }
        rows = ranked(rows);

        List<Row> scored = rows.stream().filter(r -> r.score() != null).toList();
        int topN = (int) Math.ceil(scored.size() * TOP_RATIO);
        Map<ProctorEvent.Type, Long> totals = new EnumMap<>(ProctorEvent.Type.class);
        eventCounts.values().forEach(m -> m.forEach((t, c) -> totals.merge(t, c, Long::sum)));

        int started = (int) ps.stream().filter(p -> p.getStartedAt() != null).count();
        return new Result(s.getId(), s.getTitle(), s.phase(now), ps.size(), started,
                (int) ps.stream().filter(p -> p.getSubmittedAt() != null).count(), scored.size(), average(scored),
                distribution(scored), itemAverages(scored), itemAverages(scored.subList(0, topN)),
                itemAverages(scored.subList(scored.size() - topN, scored.size())), totals,
                metrics(s, ps, ids, started), rows);
    }

    /** 엑셀에서 바로 열리도록 UTF-8 BOM + CRLF. 수식으로 해석될 수 있는 값은 막는다 (CSV 주입) */
    @Transactional(readOnly = true)
    public String csv(Long sessionId) {
        Result r = result(sessionId);
        List<String> itemKeys = new ArrayList<>(r.itemAverages().keySet());
        List<String> header = new ArrayList<>(List.of("순위", "이름", "이메일", "상태", "입장", "시작", "제출", "제출 방식", "총점", "만점"));
        header.addAll(itemKeys);
        for (ProctorEvent.Type t : ProctorEvent.Type.values()) header.add("감독:" + t.name());

        StringBuilder sb = new StringBuilder("﻿");
        line(sb, header);
        for (Row row : r.rows()) {
            List<String> cells = new ArrayList<>(List.of(row.rank() == 0 ? "" : String.valueOf(row.rank()), row.name(),
                    row.email(), row.state().name(), str(row.enteredAt()), str(row.startedAt()), str(row.submittedAt()),
                    row.submitKind() == null ? "" : row.submitKind().name(), str(row.score()), str(row.maxScore())));
            for (String k : itemKeys) cells.add(str(row.items().get(k)));
            for (ProctorEvent.Type t : ProctorEvent.Type.values()) cells.add(String.valueOf(row.events().getOrDefault(t, 0L)));
            line(sb, cells);
        }
        return sb.toString();
    }

    static String cell(String v) {
        if (v == null) return "";
        String s = v;
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) s = "\"" + s.replace("\"", "\"\"") + "\"";
        return s;
    }

    private static void line(StringBuilder sb, List<String> cells) {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(cell(cells.get(i)));
        }
        sb.append("\r\n");
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }

    private record Score(Integer total, Integer max, Map<String, Integer> items) {}

    /** 과제가 여러 개면 합산. 한 과제라도 채점이 안 끝났으면 점수 없음 */
    private Score score(ExamParticipant p) {
        Map<String, String> as = p.getAttempts();
        if (as.isEmpty()) return new Score(null, null, Map.of());
        int total = 0;
        int max = 0;
        Map<String, Integer> items = new LinkedHashMap<>();
        for (String attemptId : as.values()) {
            JsonNode report;
            try {
                report = attempts.readReport(attemptId);
            } catch (RuntimeException e) {
                log.warn("채점 결과를 읽지 못함: {}", attemptId, e);
                return new Score(null, null, Map.of());
            }
            if (report == null || !report.has("total")) return new Score(null, null, Map.of());
            total += report.path("total").asInt();
            max += report.path("max").asInt();
            for (JsonNode it : report.path("items")) {
                items.merge(it.path("name").asText(it.path("key").asText()), it.path("score").asInt(), Integer::sum);
            }
        }
        return new Score(total, max, items);
    }

    private State state(ExamParticipant p) {
        if (p.getSubmittedAt() != null) return State.SUBMITTED;
        if (p.getStartedAt() != null) {
            // 응시자가 응시 화면에서 직접 제출했을 수도 있다 (회차 제출 버튼 대신)
            boolean allDone = !p.getAttempts().isEmpty() && p.getAttempts().values().stream().allMatch(this::notSolving);
            return allDone ? State.SUBMITTED : State.SOLVING;
        }
        return p.getEnteredAt() != null ? State.WAITING : State.NOT_ENTERED;
    }

    private boolean notSolving(String attemptId) {
        try {
            return attempts.load(attemptId).status() != Attempt.Status.SOLVING;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** 같은 점수는 같은 순위 (1, 2, 2, 4). 점수 없는 응시자는 순위 0 으로 맨 뒤 */
    private static List<Row> ranked(List<Row> rows) {
        List<Row> sorted = new ArrayList<>(rows);
        sorted.sort(Comparator.comparing((Row r) -> r.score() == null).thenComparing(r -> r.score() == null ? 0 : -r.score()));
        List<Row> out = new ArrayList<>();
        Integer prev = null;
        int rank = 0;
        for (int i = 0; i < sorted.size(); i++) {
            Row r = sorted.get(i);
            if (r.score() != null && !r.score().equals(prev)) rank = i + 1;
            prev = r.score();
            out.add(new Row(r.score() == null ? 0 : rank, r.participantId(), r.name(), r.email(), r.state(), r.enteredAt(),
                    r.startedAt(), r.submittedAt(), r.submitKind(), r.score(), r.maxScore(), r.items(), r.events()));
        }
        return out;
    }

    private static Double average(List<Row> scored) {
        OptionalDouble avg = scored.stream().mapToInt(Row::score).average();
        return avg.isPresent() ? round(avg.getAsDouble()) : null;
    }

    /** 만점 대비 % 로 10점 구간 */
    private static List<Bucket> distribution(List<Row> scored) {
        int[] counts = new int[100 / BUCKET];
        for (Row r : scored) {
            int pct = r.maxScore() == null || r.maxScore() == 0 ? 0 : (int) Math.floor(100.0 * r.score() / r.maxScore());
            counts[Math.min(counts.length - 1, Math.max(0, pct / BUCKET))]++;
        }
        List<Bucket> out = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) out.add(new Bucket(i * BUCKET, (i + 1) * BUCKET, counts[i]));
        return out;
    }

    private static Map<String, Double> itemAverages(List<Row> rows) {
        Map<String, int[]> acc = new LinkedHashMap<>();
        for (Row r : rows) r.items().forEach((k, v) -> {
            int[] a = acc.computeIfAbsent(k, x -> new int[2]);
            a[0] += v;
            a[1]++;
        });
        Map<String, Double> out = new LinkedHashMap<>();
        acc.forEach((k, a) -> out.put(k, round((double) a[0] / a[1])));
        return out;
    }

    private Map<Long, Map<ProctorEvent.Type, Long>> eventCounts(List<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        Map<Long, Map<ProctorEvent.Type, Long>> out = new HashMap<>();
        for (ProctorEventRepository.TypeCount c : events.countByParticipantAndType(ids)) {
            out.computeIfAbsent(c.getParticipantId(), x -> new EnumMap<>(ProctorEvent.Type.class)).put(c.getType(), c.getCount());
        }
        return out;
    }

    private Metrics metrics(ExamSession s, List<ExamParticipant> ps, List<Long> ids, int started) {
        Long lag = s.getClosedAt() == null ? null : Duration.between(s.getEndsAt(), s.getClosedAt()).toMillis();
        long snapBytes = ids.isEmpty() ? 0 : events.sumSnapshotBytes(ids);
        long seconds = Duration.between(s.getStartsAt(), s.getEndsAt()).toSeconds();
        long video = s.isProctoring() ? started * seconds * VIDEO_BITS_PER_SECOND / 8 : 0;
        Double saved = video == 0 ? null : round(1.0 - (double) snapBytes / video);
        return new Metrics(lag, snapBytes, video, saved);
    }

    private static double round(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
