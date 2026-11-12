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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import com.pair.ai.BatchClient;
import com.pair.attempt.Attempt;
import com.pair.attempt.AttemptStore;
import com.pair.config.PairProperties;
import com.pair.scoring.ScoringService;
import com.pair.task.TaskDef;
import com.pair.task.TaskRepository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

/**
 * 채점 툴의 실험 채점. 응시 여러 개를 골라 프롬프트 버전과 설정으로 N번씩 채점하고,
 * 결과는 응시자 리포트와 따로 pilot-data/grader/runs/{runId}/ 에 저장한다.
 * 응시는 두 곳에서 고른다: 샘플(grader/samples, git 공유)과 내 응시(pilot-data/attempts).
 */
@Service
public class GraderService {

    private static final Logger log = LoggerFactory.getLogger(GraderService.class);
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.of("Asia/Seoul"));
    /** 예상 시간: 채점 한 번에 걸리는 대략의 시간(분). R1 다시 실행과 채점 모델을 동시에 부른 기준. */
    private static final double MINUTES_PER_SCORING = 0.8;
    /** 배치 API 가격 (두 회사 모두 일반 가격의 50%) */
    static final double BATCH_DISCOUNT = 0.5;

    public static final String SAMPLE = "sample";
    public static final String MINE = "mine";

    private final ScoringService scoring;
    private final PromptStore prompts;
    private final TaskRepository tasks;
    private final AttemptStore mine;
    private final AttemptStore samples;
    private final Path samplesDir;
    private final Path runsDir;
    private final PairProperties props;
    private final ObjectMapper json;
    private final ObjectMapper pretty;
    private final Map<String, RunState> running = new ConcurrentHashMap<>();
    private final BatchClient batch;
    /** 배치 채점 진행 상태 확인 (20초마다). */
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "batch-poll");
        t.setDaemon(true);
        return t;
    });

    public GraderService(ScoringService scoring, PromptStore prompts, TaskRepository tasks, AttemptStore mine,
                         PairProperties props, ObjectMapper json, BatchClient batch) {
        this.batch = batch;
        this.scoring = scoring;
        this.prompts = prompts;
        this.tasks = tasks;
        this.mine = mine;
        this.samplesDir = Path.of(props.grader().dir(), "samples").toAbsolutePath();
        this.samples = new AttemptStore(samplesDir, json);
        this.runsDir = Path.of(props.dataDir(), "grader", "runs").toAbsolutePath();
        this.props = props;
        this.json = json;
        this.pretty = json.copy().enable(SerializationFeature.INDENT_OUTPUT);
        try {
            Files.createDirectories(runsDir);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        markInterruptedRuns();
        poller.scheduleWithFixedDelay(this::pollBatches, 20, 20, TimeUnit.SECONDS);
    }

    @PreDestroy
    void shutdown() {
        poller.shutdownNow();
    }

    // ── 응시 목록 ─────────────────────

    public record AttemptRef(String source, String id) {}

    /** label: 샘플 이름(샘플만). total: 지난 채점 총점. */
    public record AttemptRow(String source, String id, String label, String taskId, String taskTitle, String taskType,
                             Instant startedAt, Integer total, int chatTurns) {}

    public List<AttemptRow> attempts() {
        List<AttemptRow> out = new ArrayList<>();
        Map<String, String> labels = sampleLabels();
        // 샘플은 index.json 순서대로 (목록에 없는 샘플은 뒤에)
        List<String> sampleIds = new ArrayList<>(labels.keySet());
        for (String id : ids(samplesDir)) if (!sampleIds.contains(id)) sampleIds.add(id);
        for (String id : sampleIds) {
            AttemptRow r = row(SAMPLE, id, labels.getOrDefault(id, id));
            if (r != null) out.add(r);
        }
        List<AttemptRow> my = new ArrayList<>();
        for (String id : ids(mine.root())) {
            AttemptRow r = row(MINE, id, null);
            if (r != null) my.add(r);
        }
        my.sort(Comparator.comparing(AttemptRow::startedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        out.addAll(my);
        return out;
    }

    private AttemptRow row(String source, String id, String label) {
        AttemptStore src = store(source);
        try {
            Attempt a = src.load(id);
            if (a.followupsDoneAt() == null) return null; // 후속 질문까지 끝나야 채점할 수 있다
            TaskDef t = tasks.get(a.taskId());
            JsonNode rep = src.readReport(id);
            Integer total = rep != null && rep.path("version").asInt() >= 2 ? rep.path("total").asInt() : null;
            return new AttemptRow(source, id, label, t.id(), t.title(), t.type(), a.startedAt(), total, src.turns(id).size());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private Map<String, String> sampleLabels() {
        Map<String, String> m = new LinkedHashMap<>();
        Path index = samplesDir.resolve("index.json");
        if (!Files.exists(index)) return m;
        try {
            for (JsonNode n : json.readTree(index.toFile())) m.put(n.path("id").asText(), n.path("label").asText());
        } catch (IOException e) {
            log.warn("샘플 목록(index.json)을 읽지 못했습니다: {}", e.getMessage());
        }
        return m;
    }

    private static List<String> ids(Path dir) {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(Files::isDirectory).map(p -> p.getFileName().toString()).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private AttemptStore store(String source) {
        if (SAMPLE.equals(source)) return samples;
        if (MINE.equals(source)) return mine;
        throw new IllegalArgumentException("응시 출처는 sample 또는 mine 입니다: " + source);
    }

    // ── 예상 비용 ─────────────────────

    /** mode: api(바로 호출) 또는 batch(배치 API, 비용 절반, 결과는 몇 분~최대 24시간 뒤) */
    /** batchWaitMinutes: 배치 단계마다 기다릴 최대 시간(분). 넘으면 남은 요청을 일반 API 로 보낸다. */
    public record RunRequest(List<AttemptRef> attempts, String versionId, int count, int replays, int judgeRepeat, String mode,
                             int batchWaitMinutes) {}

    static final int DEFAULT_BATCH_WAIT = 10;

    static boolean isBatch(String mode) {
        return "batch".equals(mode);
    }

    /** basis: 지난 채점 기록(report) / 같은 과제 평균(task) / 기본값(default) */
    public record AttemptEstimate(String source, String id, double usdPerScoring, String basis) {}

    public record Estimate(int scorings, double usd, double minutes, List<AttemptEstimate> attempts) {}

    /** 채점 설정은 실제 채점과 같게 고정한다(R1 다시 실행 횟수, 채점 모델 1번씩). 채점 툴에서는 반복 횟수만 바꾼다. */
    private RunRequest fixed(RunRequest req) {
        // 채점 모델도 실제 채점처럼 1번씩 (평균은 반복 채점 결과를 보고 팀이 정함)
        return new RunRequest(req.attempts(), req.versionId(), req.count(), props.r2().replaysPerTurn(), 1,
                isBatch(req.mode()) ? "batch" : "api", req.batchWaitMinutes() <= 0 ? DEFAULT_BATCH_WAIT : req.batchWaitMinutes());
    }

    public Estimate estimate(RunRequest req) {
        req = fixed(req);
        validate(req, false);
        List<AttemptEstimate> per = new ArrayList<>();
        double usd = 0;
        for (AttemptRef ref : req.attempts()) {
            AttemptEstimate e = estimateOne(ref, req.replays(), req.judgeRepeat());
            per.add(e);
            usd += e.usdPerScoring() * req.count();
        }
        if (isBatch(req.mode())) {
            usd *= BATCH_DISCOUNT;
            per = per.stream().map(e -> new AttemptEstimate(e.source(), e.id(), round4(e.usdPerScoring() * BATCH_DISCOUNT), e.basis())).toList();
        }
        int scorings = req.attempts().size() * req.count();
        int parallel = Math.max(1, props.grader().parallel());
        double minutes = Math.ceil((double) scorings / parallel) * MINUTES_PER_SCORING * (req.judgeRepeat() > 1 ? 1.2 : 1);
        return new Estimate(scorings, round4(usd), Math.round(minutes * 10) / 10.0, per);
    }

    private AttemptEstimate estimateOne(AttemptRef ref, int replays, int judgeRepeat) {
        AttemptStore src = store(ref.source());
        JsonNode rep = src.readReport(ref.id());
        String basis = "report";
        if (rep == null || !rep.has("tokens")) {
            rep = averageReport(src.load(ref.id()).taskId());
            basis = rep == null ? "default" : "task";
        }
        double usd;
        if (rep == null) {
            // 기본값: 채점 모델 입력 1.2만, 출력 3천 토큰씩, 다시 실행 9번에 입력 1만, 출력 3천 토큰
            usd = judgeRepeat * (cost(props.judge().claude().model(), 12000, 3000) + cost(props.judge().openai().model(), 12000, 3000))
                    + replays / 3.0 * cost(props.assistant().model(), 10000, 3000);
        } else {
            // settings 가 없는 예전 리포트는 다시 실행 3번으로 채점한 것이다
            usd = scaledCost(rep.path("tokens"), rep.path("settings").path("replays").asInt(3), replays, judgeRepeat,
                    rep.path("settings").path("judgeRepeat").asInt(1));
        }
        return new AttemptEstimate(ref.source(), ref.id(), round4(usd), basis);
    }

    /** 지난 채점의 토큰을 새 설정에 맞게 늘리거나 줄여 비용을 계산한다. */
    private double scaledCost(JsonNode tokens, int oldReplays, int replays, int judgeRepeat, int oldRepeat) {
        double r = oldReplays <= 0 ? 1 : (double) replays / oldReplays;
        double j = (double) judgeRepeat / Math.max(1, oldRepeat);
        double usd = 0;
        JsonNode rp = tokens.path("r2Replay");
        usd += r * cost(props.assistant().model(), rp.path("input").asLong(), rp.path("output").asLong());
        for (String k : List.of("judge_claude", "judge_openai")) {
            JsonNode t = tokens.path(k);
            usd += j * cost(t.path("model").asText(), t.path("input").asLong(), t.path("output").asLong());
        }
        return usd;
    }

    /** 같은 과제의 지난 채점 기록 중 아무거나(샘플 먼저) 하나를 기준으로 쓴다. */
    private JsonNode averageReport(String taskId) {
        for (AttemptStore src : List.of(samples, mine)) {
            for (String id : ids(src.root())) {
                try {
                    if (!src.load(id).taskId().equals(taskId)) continue;
                    JsonNode rep = src.readReport(id);
                    if (rep != null && rep.has("tokens")) return rep;
                } catch (RuntimeException ignored) {
                    // 읽을 수 없는 응시는 건너뜀
                }
            }
        }
        return null;
    }

    /** 리포트의 토큰으로 이번 채점에 실제로 든 비용 (응시 중 어시스턴트 비용은 빼고 채점 비용만). */
    double actualCost(Map<String, Object> report) {
        JsonNode tokens = json.valueToTree(report).path("tokens");
        double usd = 0;
        JsonNode rp = tokens.path("r2Replay");
        usd += cost(props.assistant().model(), rp.path("input").asLong(), rp.path("output").asLong());
        for (String k : List.of("judge_claude", "judge_openai")) {
            JsonNode t = tokens.path(k);
            usd += cost(t.path("model").asText(), t.path("input").asLong(), t.path("output").asLong());
        }
        return usd;
    }

    private double cost(String model, long in, long out) {
        PairProperties.Price p = props.pricing() == null ? null : props.pricing().get(model);
        if (p == null) return 0;
        return (in * p.input() + out * p.output()) / 1_000_000.0;
    }

    // ── 실험 채점 실행 ─────────────────

    /** 실험 채점 한 번의 기록. status: RUNNING, DONE, CANCELLED, INTERRUPTED(서버가 꺼져 중단) */
    public record RunMeta(String id, Instant createdAt, Instant finishedAt, String author, String versionId, String versionName,
                          List<AttemptRow> attempts, int count, int replays, int judgeRepeat, String status,
                          int done, int failed, int total, double estimateUsd, double actualUsd, List<String> errors,
                          String mode, String phase) {

        /** 상태, 진행 수, 비용 같은 것만 바꾼 사본. */
        RunMeta with(String status, int done, int failed, double actualUsd, List<String> errors, Instant finishedAt, String phase) {
            return new RunMeta(id, createdAt, finishedAt, author, versionId, versionName, attempts, count, replays, judgeRepeat,
                    status, done, failed, total, estimateUsd, actualUsd, errors, mode, phase);
        }
    }

    private static final class RunState {
        volatile boolean cancelled;
        RunMeta meta;
        int skipped; // 취소로 건너뛴 회차

        RunState(RunMeta meta) {
            this.meta = meta;
        }
    }

    public RunMeta start(RunRequest req, String author) {
        req = fixed(req);
        validate(req, true);
        PromptVersion version = prompts.get(req.versionId());
        List<AttemptRow> rows = new ArrayList<>();
        for (AttemptRef ref : req.attempts()) {
            AttemptRow r = row(ref.source(), ref.id(), SAMPLE.equals(ref.source()) ? sampleLabels().getOrDefault(ref.id(), ref.id()) : null);
            if (r == null) throw new IllegalArgumentException("채점할 수 없는 응시입니다(후속 질문 전이거나 없음): " + ref.id());
            rows.add(r);
        }
        String id = STAMP.format(Instant.now());
        for (int i = 2; Files.exists(runsDir.resolve(id)); i++) id = STAMP.format(Instant.now()) + "-" + i;
        Estimate est = estimate(req);
        boolean useBatch = isBatch(req.mode());
        RunMeta meta = new RunMeta(id, Instant.now(), null, author == null ? "" : author.trim(), version.id(), version.name(), rows,
                req.count(), req.replays(), req.judgeRepeat(), "RUNNING", 0, 0, est.scorings(), est.usd(), 0, List.of(),
                useBatch ? "batch" : "api", useBatch ? "배치 요청을 만드는 중" : null);
        RunState state = new RunState(meta);
        running.put(id, state);
        writeMeta(meta);
        ScoringService.Options opt = new ScoringService.Options(version, req.replays(), req.judgeRepeat());
        if (useBatch) {
            BatchState bs = new BatchState(0, units(rows, req.count()), new LinkedHashMap<>(), new LinkedHashMap<>(), new ArrayList<>(),
                    null, req.batchWaitMinutes(), false);
            writeBatch(id, bs);
            String runId = id;
            scoring.submit(() -> {
                advanceBatch(runId); // 1단계 요청을 만들어 보낸다
                return null;
            });
            log.info("배치 실험 채점 시작: {} (응시 {}개 × {}번, 버전 {})", id, rows.size(), req.count(), version.id());
            return meta;
        }
        for (AttemptRow r : rows) {
            for (int k = 1; k <= req.count(); k++) {
                int n = k;
                String runId = id;
                scoring.submit(() -> {
                    runOne(runId, state, r, n, opt);
                    return null;
                });
            }
        }
        log.info("실험 채점 시작: {} (응시 {}개 × {}번, 버전 {})", id, rows.size(), req.count(), version.id());
        return meta;
    }

    private void runOne(String runId, RunState state, AttemptRow r, int n, ScoringService.Options opt) {
        if (state.cancelled) {
            finishOne(runId, state, 0, null, false);
            return;
        }
        String name = r.source() + "__" + r.id() + "__" + n;
        try {
            Map<String, Object> report = scoring.evaluate(store(r.source()), r.id(), opt);
            report.put("graderRun", Map.of("runId", runId, "source", r.source(), "n", n));
            write(resultsDir(runId).resolve(name + ".json"), report);
            finishOne(runId, state, actualCost(report), null, true);
        } catch (Exception e) {
            log.warn("실험 채점 실패: {} {} #{}: {}", runId, r.id(), n, e.getMessage());
            finishOne(runId, state, 0, r.id() + " #" + n + ": " + (e.getMessage() == null ? e.toString() : e.getMessage()), false);
        }
    }

    private synchronized void finishOne(String runId, RunState state, double usd, String error, boolean ok) {
        RunMeta m = state.meta;
        List<String> errors = new ArrayList<>(m.errors());
        if (error != null) errors.add(error);
        int done = m.done() + (ok ? 1 : 0);
        int failed = m.failed() + (ok || error == null ? 0 : 1);
        if (!ok && error == null) state.skipped++;
        int finished = done + failed + state.skipped;
        boolean all = finished >= m.total();
        String status = all ? (state.cancelled ? "CANCELLED" : "DONE") : "RUNNING";
        RunMeta next = m.with(status, done, failed, round4(m.actualUsd() + usd), errors, all ? Instant.now() : null, m.phase());
        state.meta = next;
        writeMeta(next);
        if (all) {
            running.remove(runId);
            log.info("실험 채점 끝: {} ({}, 성공 {}, 실패 {}, ${})", runId, status, done, failed, next.actualUsd());
        }
    }

    public RunMeta cancel(String runId) {
        RunState s = running.get(runId);
        if (s == null) throw new IllegalStateException("진행 중인 실험 채점이 아닙니다: " + runId);
        s.cancelled = true;
        if (isBatch(s.meta.mode())) {
            synchronized (s) {
                BatchState bs = readBatch(runId);
                for (var e : bs.batches().entrySet()) {
                    try {
                        if (e.getKey().equals("claude")) batch.anthropicCancel(e.getValue());
                        else batch.openaiCancel(e.getValue());
                    } catch (RuntimeException ex) {
                        log.warn("배치 취소 실패: {} {}", e.getValue(), ex.getMessage());
                    }
                }
                RunMeta m = s.meta.with("CANCELLED", s.meta.done(), s.meta.failed(), s.meta.actualUsd(), s.meta.errors(), Instant.now(), "멈춤");
                s.meta = m;
                writeMeta(m);
                running.remove(runId);
            }
        }
        return s.meta;
    }

    // ── 배치 채점 ─────────────────────
    // 채점 코드를 그대로 돌리면서 필요한 모델 호출을 배치 요청으로 모은다(BatchCalls).
    // 단계마다: 요청 모으기 → 배치 보내기 → 20초마다 상태 확인 → 결과 받기 → 다음 단계.
    // 1단계: 다시 실행(luna) + 판정(Claude, OpenAI). 2단계: R1 비교. 더 모을 요청이 없으면 리포트를 만든다.
    // 배치 ID 와 받은 결과는 batch.json 에 저장해서 서버를 다시 켜도 이어서 진행한다.

    /** units: 채점 단위(응시 × 회차). batches: 배치 이름(claude 또는 openai:모델) → 배치 ID. known: custom_id → 받은 결과 */
    /**
     * roundStartedAt: 지금 단계 배치를 보낸 시각, waitMinutes: 단계마다 기다릴 최대 시간,
     * fallback: 대기 시간을 넘겨 남은 요청을 일반 API 로 처리했는지
     */
    public record BatchState(int round, List<Unit> units, Map<String, String> batches, Map<String, BatchClient.Answer> known,
                             List<String> errors, Instant roundStartedAt, int waitMinutes, boolean fallback) {}

    public record Unit(String source, String id, int n) {}

    private static List<Unit> units(List<AttemptRow> rows, int count) {
        List<Unit> out = new ArrayList<>();
        for (AttemptRow r : rows) for (int k = 1; k <= count; k++) out.add(new Unit(r.source(), r.id(), k));
        return out;
    }

    private void pollBatches() {
        for (RunState s : List.copyOf(running.values())) {
            if (!isBatch(s.meta.mode()) || s.cancelled) continue;
            try {
                advanceBatch(s.meta.id());
            } catch (Exception e) {
                log.warn("배치 진행 확인 실패: {} {}", s.meta.id(), e.getMessage());
                setPhase(s, "확인 실패, 20초 뒤 다시 시도: " + e.getMessage());
            }
        }
    }

    /** 보낸 배치가 끝났는지 보고, 끝났으면 결과를 받아 다음 단계로 간다. */
    private void advanceBatch(String runId) {
        RunState s = running.get(runId);
        if (s == null || s.cancelled) return;
        synchronized (s) {
            BatchState bs = readBatch(runId);
            if (!bs.batches().isEmpty()) {
                List<String> states = new ArrayList<>();
                boolean allDone = true;
                Map<String, BatchClient.Status> statuses = new LinkedHashMap<>();
                for (var e : bs.batches().entrySet()) {
                    BatchClient.Status st = e.getKey().equals("claude") ? batch.anthropicStatus(e.getValue()) : batch.openaiStatus(e.getValue());
                    statuses.put(e.getKey(), st);
                    String model = e.getKey().equals("claude") ? props.judge().claude().model() : e.getKey().substring("openai:".length());
                    states.add(model + " " + st.label() + (st.total() > 0 ? " " + st.finished() + "/" + st.total() : ""));
                    allDone &= st.done();
                }
                boolean timedOut = !allDone && bs.waitMinutes() > 0 && bs.roundStartedAt() != null
                        && java.time.Duration.between(bs.roundStartedAt(), Instant.now()).toMinutes() >= bs.waitMinutes();
                if (!allDone && !timedOut) {
                    long waited = bs.roundStartedAt() == null ? 0 : java.time.Duration.between(bs.roundStartedAt(), Instant.now()).toMinutes();
                    setPhase(s, bs.round() + "단계 배치 처리 중 (" + waited + "/" + bs.waitMinutes() + "분) · " + String.join(" · ", states));
                    return;
                }
                if (timedOut) {
                    // 대기 시간 초과: 안 끝난 배치는 취소하고, 끝난 배치 결과만 받은 뒤 나머지는 일반 API 로 채점한다
                    Map<String, BatchClient.Answer> known = new LinkedHashMap<>(bs.known());
                    for (var e : statuses.entrySet()) {
                        String bid = bs.batches().get(e.getKey());
                        if (!e.getValue().done()) {
                            try {
                                if (e.getKey().equals("claude")) batch.anthropicCancel(bid);
                                else batch.openaiCancel(bid);
                            } catch (RuntimeException ex) {
                                log.warn("배치 취소 실패: {} {}", bid, ex.getMessage());
                            }
                            continue;
                        }
                        collect(e.getKey(), e.getValue(), known);
                    }
                    bs = new BatchState(bs.round(), bs.units(), new LinkedHashMap<>(), known, bs.errors(), bs.roundStartedAt(), bs.waitMinutes(), true);
                    writeBatch(runId, bs);
                    log.info("배치 대기 {}분 초과, 남은 요청은 일반 API 로: {}", bs.waitMinutes(), runId);
                    ScoringService.Options opt = new ScoringService.Options(prompts.get(s.meta.versionId()), s.meta.replays(), s.meta.judgeRepeat());
                    setPhase(s, "대기 " + bs.waitMinutes() + "분 초과 · 남은 요청을 일반 API로 채점 중");
                    finishBatch(runId, s, bs, opt);
                    return;
                }
                Map<String, BatchClient.Answer> known = new LinkedHashMap<>(bs.known());
                for (var e : statuses.entrySet()) {
                    collect(e.getKey(), e.getValue(), known);
                }
                bs = new BatchState(bs.round(), bs.units(), new LinkedHashMap<>(), known, bs.errors(), bs.roundStartedAt(), bs.waitMinutes(), bs.fallback());
                writeBatch(runId, bs);
            }
            // 다음 단계 요청 모으기
            setPhase(s, "배치 요청을 만드는 중 (" + (bs.round() + 1) + "단계)");
            ScoringService.Options opt = new ScoringService.Options(prompts.get(s.meta.versionId()), s.meta.replays(), s.meta.judgeRepeat());
            List<BatchCalls.Pending> pending = new ArrayList<>();
            for (int i = 0; i < bs.units().size(); i++) {
                Unit u = bs.units().get(i);
                try {
                    scoring.evaluate(store(u.source()), u.id(), opt, new BatchCalls("u" + i, bs.known(), pending, false, batch, scoring));
                } catch (RuntimeException e) {
                    log.warn("배치 요청 만들기 실패: {} {}", u.id(), e.getMessage());
                }
            }
            // 이미 받은 결과는 다시 보내지 않는다
            Map<String, BatchClient.Answer> knownNow = bs.known();
            pending.removeIf(p -> knownNow.containsKey(p.customId()));
            if (pending.isEmpty()) {
                finishBatch(runId, s, bs, opt);
                return;
            }
            Map<String, List<BatchClient.Req>> groups = new LinkedHashMap<>();
            for (BatchCalls.Pending p : pending) {
                String g = p.kind().equals("claude") ? "claude" : "openai:" + p.model();
                groups.computeIfAbsent(g, k -> new ArrayList<>()).add(new BatchClient.Req(p.customId(), p.body()));
            }
            Map<String, String> sent = new LinkedHashMap<>();
            for (var e : groups.entrySet()) {
                String bid = e.getKey().equals("claude") ? batch.anthropicCreate(e.getValue()) : batch.openaiCreate(e.getValue());
                sent.put(e.getKey(), bid);
            }
            int round = bs.round() + 1;
            writeBatch(runId, new BatchState(round, bs.units(), sent, bs.known(), bs.errors(), Instant.now(), bs.waitMinutes(), bs.fallback()));
            List<String> models = sent.keySet().stream()
                    .map(k -> (k.equals("claude") ? props.judge().claude().model() : k.substring("openai:".length())) + " 접수").toList();
            setPhase(s, round + "단계 배치 보냄 (" + pending.size() + "건) · " + String.join(" · ", models));
            log.info("배치 {}단계 보냄: {} {}", round, runId, sent);
        }
    }

    /** 배치 결과를 known 에 모은다. */
    private void collect(String group, BatchClient.Status st, Map<String, BatchClient.Answer> known) {
        if (group.equals("claude")) {
            if (st.resultsUrl() != null) batch.anthropicResults(st.resultsUrl()).forEach((k, v) -> known.put(k, BatchClient.fromAnthropic(v)));
        } else {
            batch.openaiResults(st).forEach((k, v) -> known.put(k, BatchClient.fromOpenai(v)));
        }
    }

    /** 모든 결과를 받았으니 리포트를 만든다. fallback 이면 결과가 없는 호출은 일반 API 로 바로 부른다. */
    private void finishBatch(String runId, RunState s, BatchState bs, ScoringService.Options opt) {
        if (!bs.fallback()) setPhase(s, "리포트 만드는 중");
        for (int i = 0; i < bs.units().size(); i++) {
            Unit u = bs.units().get(i);
            String name = u.source() + "__" + u.id() + "__" + u.n();
            try {
                BatchCalls calls = new BatchCalls("u" + i, bs.known(), new ArrayList<>(), true, batch, scoring,
                        bs.fallback() ? scoring.live() : null);
                Map<String, Object> report = scoring.evaluate(store(u.source()), u.id(), opt, calls);
                report.put("graderRun", Map.of("runId", runId, "source", u.source(), "n", u.n(), "mode", "batch", "fallback", bs.fallback()));
                write(resultsDir(runId).resolve(name + ".json"), report);
                // 배치로 받은 부분은 절반 가격, 일반 API 로 부른 부분은 정가
                double liveUsd = 0;
                for (BatchCalls.Used used : calls.liveUsed()) liveUsd += cost(used.model(), used.input(), used.output());
                double usd = (actualCost(report) - liveUsd) * BATCH_DISCOUNT + liveUsd;
                finishOne(runId, s, usd, null, true);
            } catch (Exception e) {
                finishOne(runId, s, 0, u.id() + " #" + u.n() + ": " + (e.getMessage() == null ? e.toString() : e.getMessage()), false);
            }
        }
        setPhase(s, bs.fallback() ? "완료 (대기 " + bs.waitMinutes() + "분 초과분은 일반 API)" : "완료");
    }

    private void setPhase(RunState s, String phase) {
        synchronized (this) {
            RunMeta m = s.meta;
            RunMeta next = m.with(m.status(), m.done(), m.failed(), m.actualUsd(), m.errors(), m.finishedAt(), phase);
            s.meta = next;
            writeMeta(next);
        }
    }

    private BatchState readBatch(String runId) {
        try {
            return json.readValue(runDir(runId).resolve("batch.json").toFile(), BatchState.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void writeBatch(String runId, BatchState bs) {
        write(runDir(runId).resolve("batch.json"), bs);
    }

    // ── 결과 조회 ─────────────────────

    public List<RunMeta> runs() {
        List<RunMeta> out = new ArrayList<>();
        for (String id : ids(runsDir)) {
            try {
                out.add(meta(id));
            } catch (RuntimeException e) {
                log.warn("실험 채점 기록을 읽지 못했습니다: {}", id);
            }
        }
        out.sort(Comparator.comparing(RunMeta::createdAt).reversed());
        return out;
    }

    public RunMeta meta(String runId) {
        RunState s = running.get(runId);
        if (s != null) return s.meta;
        try {
            return json.readValue(runDir(runId).resolve("run.json").toFile(), RunMeta.class);
        } catch (IOException e) {
            throw new NoSuchElementException("없는 실험 채점입니다: " + runId);
        }
    }

    /** 결과 요약: 회차마다 총점, 항목 점수, 체크별 감점과 판정. 화면에서 분포, 흔들림, 버전 비교를 계산한다. */
    public record ResultSummary(String file, String source, String attemptId, int n, int total, Map<String, Integer> items,
                                List<CheckSummary> checks) {}

    public record CheckSummary(String code, String item, String method, int points, int deducted, String status, List<JudgeVote> judges) {}

    public record JudgeVote(String judge, String model, boolean violated) {}

    public List<ResultSummary> results(String runId) {
        List<ResultSummary> out = new ArrayList<>();
        Path dir = resultsDir(runId);
        if (!Files.isDirectory(dir)) return out;
        try (Stream<Path> s = Files.list(dir)) {
            for (Path p : s.filter(f -> f.toString().endsWith(".json")).sorted().toList()) {
                JsonNode r = json.readTree(p.toFile());
                String[] parts = p.getFileName().toString().replace(".json", "").split("__");
                Map<String, Integer> items = new LinkedHashMap<>();
                List<CheckSummary> checks = new ArrayList<>();
                for (JsonNode it : r.path("items")) {
                    items.put(it.path("key").asText(), it.path("score").asInt());
                    for (JsonNode c : it.path("checks")) {
                        List<JudgeVote> votes = new ArrayList<>();
                        for (JsonNode j : c.path("judges")) votes.add(new JudgeVote(j.path("judge").asText(), j.path("model").asText(), j.path("violated").asBoolean()));
                        checks.add(new CheckSummary(c.path("code").asText(), it.path("key").asText(), c.path("method").asText(),
                                c.path("points").asInt(), c.path("deducted").asInt(), c.path("status").asText(), votes));
                    }
                }
                out.add(new ResultSummary(p.getFileName().toString(), parts[0], parts.length > 1 ? parts[1] : "",
                        parts.length > 2 ? Integer.parseInt(parts[2]) : 0, r.path("total").asInt(), items, checks));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }

    /** 회차 하나의 전체 리포트 (리포트 화면과 같은 형식). */
    public JsonNode result(String runId, String file) {
        if (!file.matches("[a-z]+__[a-z0-9-]+__\\d+\\.json")) throw new IllegalArgumentException("잘못된 파일 이름: " + file);
        Path p = resultsDir(runId).resolve(file);
        if (!Files.exists(p)) throw new NoSuchElementException("없는 결과입니다: " + file);
        try {
            return json.readTree(p.toFile());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 내보내기: 실험 정보와 회차별 전체 리포트를 JSON 하나로. */
    public Map<String, Object> export(String runId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("run", meta(runId));
        try {
            m.put("version", prompts.get(meta(runId).versionId()));
        } catch (RuntimeException e) {
            m.put("version", null); // 버전 파일이 지워졌거나 아직 pull 받지 않은 경우
        }
        List<JsonNode> reports = new ArrayList<>();
        for (ResultSummary r : results(runId)) reports.add(result(runId, r.file()));
        m.put("results", reports);
        return m;
    }

    // ── 내부 ───────────────────────────

    private void validate(RunRequest req, boolean full) {
        if (req.attempts() == null || req.attempts().isEmpty()) throw new IllegalArgumentException("채점할 응시를 하나 이상 고르세요.");
        if (req.count() < 1 || req.count() > 20) throw new IllegalArgumentException("채점 횟수는 1~20번입니다.");
        if (req.replays() < 1 || req.replays() > 10) throw new IllegalArgumentException("R1 다시 실행 횟수는 1~10번입니다.");
        if (req.judgeRepeat() < 1 || req.judgeRepeat() > 3) throw new IllegalArgumentException("채점 모델 반복은 1~3번입니다.");
        if (isBatch(req.mode()) && (req.batchWaitMinutes() < 1 || req.batchWaitMinutes() > 1440)) {
            throw new IllegalArgumentException("배치 최대 대기 시간은 1~1440분입니다.");
        }
        if (full && (req.versionId() == null || req.versionId().isBlank())) throw new IllegalArgumentException("프롬프트 버전을 고르세요.");
        for (AttemptRef r : req.attempts()) store(r.source()).dir(r.id());
    }

    /** 서버가 꺼져서 끝나지 못한 실험은 다시 켤 때 '중단됨'으로 표시한다. */
    private void markInterruptedRuns() {
        for (String id : ids(runsDir)) {
            try {
                RunMeta m = json.readValue(runDir(id).resolve("run.json").toFile(), RunMeta.class);
                if (!"RUNNING".equals(m.status())) continue;
                if (isBatch(m.mode()) && Files.exists(runDir(id).resolve("batch.json"))) {
                    // 배치는 서버가 꺼져 있어도 각 회사 쪽에서 계속 처리된다. 다시 켜면 이어서 결과를 받는다.
                    running.put(id, new RunState(m));
                    log.info("배치 실험 채점 이어서 진행: {}", id);
                    continue;
                }
                writeMeta(m.with("INTERRUPTED", m.done(), m.failed(), m.actualUsd(), m.errors(), Instant.now(), m.phase()));
            } catch (IOException | RuntimeException e) {
                log.warn("실험 채점 기록을 읽지 못했습니다: {}", id);
            }
        }
    }

    private Path runDir(String runId) {
        if (runId == null || !runId.matches("[0-9-]+")) throw new IllegalArgumentException("잘못된 실험 ID: " + runId);
        return runsDir.resolve(runId);
    }

    private Path resultsDir(String runId) {
        return runDir(runId).resolve("results");
    }

    private void writeMeta(RunMeta m) {
        write(runDir(m.id()).resolve("run.json"), m);
    }

    private void write(Path p, Object v) {
        try {
            Files.createDirectories(p.getParent());
            Files.writeString(p, pretty.writeValueAsString(v), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static double round4(double v) {
        return Math.round(v * 10000) / 10000.0;
    }
}
