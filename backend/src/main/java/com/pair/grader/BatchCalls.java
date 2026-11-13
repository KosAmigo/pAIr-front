package com.pair.grader;

import java.util.List;
import java.util.Map;

import org.springframework.ai.converter.BeanOutputConverter;

import com.pair.ai.AiUnavailableException;
import com.pair.ai.BatchClient;
import com.pair.ai.BatchClient.Answer;
import com.pair.ai.Judge;
import com.pair.scoring.ScoringService;
import com.pair.scoring.ScoringService.JudgeResult;

import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 배치 채점용 채점 모델 호출. 채점 코드(ScoringService.evaluate)를 그대로 두 번 돌리면서
 * - 이미 받은 배치 결과(known)가 있으면 그 결과를 돌려주고
 * - 없으면 보낼 요청으로 모아 두고(pending) 빈 결과를 돌려준다.
 * 1단계: 판정 요청이 모인다.
 * 마지막(last): 받은 결과로 실제 리포트를 만든다. 빠진 결과는 실패로 처리한다.
 *
 * custom_id 는 [a-zA-Z0-9_-]{1,64} 여야 해서 "u3-claude-1" 처럼 만든다.
 */
final class BatchCalls implements ScoringService.Calls {

    /** kind: claude(Anthropic 배치) 또는 openai(OpenAI 배치, model 별로 나눔) */
    record Pending(String customId, String kind, String model, ObjectNode body) {}

    /** 일반 API 로 부른 호출의 토큰 (정가로 계산하려고 따로 모은다). */
    record Used(String model, long input, long output) {}

    private final String unit;
    private final Map<String, Answer> known;
    private final List<Pending> pending;
    private final boolean last;
    private final BatchClient client;
    private final ScoringService scoring;
    /** 배치 대기 시간을 넘겨 일반 API 로 넘어갔을 때: 결과가 없는 호출은 이걸로 바로 부른다. */
    private final ScoringService.Calls live;
    private final List<Used> liveUsed = new java.util.ArrayList<>();

    BatchCalls(String unit, Map<String, Answer> known, List<Pending> pending, boolean last, BatchClient client, ScoringService scoring) {
        this(unit, known, pending, last, client, scoring, null);
    }

    BatchCalls(String unit, Map<String, Answer> known, List<Pending> pending, boolean last, BatchClient client, ScoringService scoring,
               ScoringService.Calls live) {
        this.unit = unit;
        this.known = known;
        this.pending = pending;
        this.last = last;
        this.client = client;
        this.scoring = scoring;
        this.live = live;
    }

    List<Used> liveUsed() {
        synchronized (liveUsed) {
            return List.copyOf(liveUsed);
        }
    }

    private void used(String model, long in, long out) {
        synchronized (liveUsed) {
            liveUsed.add(new Used(model, in, out));
        }
    }

    @Override
    public Judge.Result<JudgeResult> judge(Judge base, int repeat, String system, String prefix, String body) {
        String key = unit + "-" + base.name() + "-" + repeat;
        Answer a = known.get(key);
        BeanOutputConverter<JudgeResult> converter = new BeanOutputConverter<>(JudgeResult.class);
        if (a == null && live != null) {
            Judge.Result<JudgeResult> r = live.judge(base, repeat, system, prefix, body);
            used(base.model(), r.inputTokens(), r.outputTokens());
            return r;
        }
        if (a == null) {
            if (last) throw new AiUnavailableException(base.name() + " 채점 배치 결과가 없습니다.");
            boolean claude = "claude".equals(base.name());
            ObjectNode req = claude ? client.claudeJudgeParams(system, prefix, body, converter.getJsonSchema())
                    : client.openaiJudgeBody(system, prefix, body, converter.getJsonSchema());
            add(new Pending(key, claude ? "claude" : "openai", base.model(), req));
            return new Judge.Result<>(new JudgeResult(List.of()), 0, 0, 0);
        }
        if (!a.ok()) throw new AiUnavailableException(base.name() + " 채점 배치 실패: " + a.error());
        if (a.text().isBlank()) throw new AiUnavailableException(base.name() + " 채점 배치 응답이 비어 있습니다 (finish=" + a.finishReason() + ").");
        try {
            return new Judge.Result<>(converter.convert(a.text()), a.inputTokens(), a.outputTokens(), a.cachedInputTokens());
        } catch (RuntimeException e) {
            throw new AiUnavailableException(base.name() + " 채점 배치 결과를 읽지 못했습니다: " + e.getMessage());
        }
    }

    private void add(Pending p) {
        synchronized (pending) {
            pending.add(p);
        }
    }
}
