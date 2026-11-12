package com.pair.grader;

import java.util.List;
import java.util.Map;

import org.springframework.ai.converter.BeanOutputConverter;

import com.pair.ai.AiUnavailableException;
import com.pair.ai.AssistantClient;
import com.pair.ai.BatchClient;
import com.pair.ai.BatchClient.Answer;
import com.pair.ai.Judge;
import com.pair.attempt.ChatTurn;
import com.pair.scoring.ScoringService;
import com.pair.scoring.ScoringService.JudgeResult;
import com.pair.scoring.ScoringService.ReplayJudgement;

import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 배치 채점용 모델 호출. 채점 코드(ScoringService.evaluate)를 그대로 여러 번 돌리면서
 * - 이미 받은 배치 결과(known)가 있으면 그 결과를 돌려주고
 * - 없으면 보낼 요청으로 모아 두고(pending) 빈 결과를 돌려준다.
 * 1단계: 다시 실행과 판정 요청이 모인다(다시 실행 답이 비어 있어 비교 요청은 아직 안 생김).
 * 2단계: 다시 실행 답을 받은 뒤 다시 돌리면 R1 비교 요청이 모인다.
 * 마지막(last): 모든 결과로 실제 리포트를 만든다. 빠진 결과는 실패로 처리한다.
 *
 * custom_id 는 [a-zA-Z0-9_-]{1,64} 여야 해서 "u3-claude-1", "u3-t05-k2", "u3-c05" 처럼 만든다.
 */
final class BatchCalls implements ScoringService.Calls {

    /** kind: claude(Anthropic 배치) 또는 openai(OpenAI 배치, model 별로 나눔) */
    record Pending(String customId, String kind, String model, ObjectNode body) {}

    private final String unit;
    private final Map<String, Answer> known;
    private final List<Pending> pending;
    private final boolean last;
    private final BatchClient client;
    private final ScoringService scoring;

    BatchCalls(String unit, Map<String, Answer> known, List<Pending> pending, boolean last, BatchClient client, ScoringService scoring) {
        this.unit = unit;
        this.known = known;
        this.pending = pending;
        this.last = last;
        this.client = client;
        this.scoring = scoring;
    }

    @Override
    public AssistantClient.Reply replay(int turn, int k, ChatTurn.AssistantRequest req) {
        String key = unit + "-t" + pad(turn) + "-k" + k;
        Answer a = known.get(key);
        if (a == null) {
            if (!last) add(new Pending(key, "openai", req.model(), client.replayBody(req)));
            return new AssistantClient.Reply("", req.model(), 0, 0, 0, "none", 0);
        }
        // 실패한 다시 실행은 빈 답으로 둔다(일반 채점처럼 비교에서 빠진다)
        return new AssistantClient.Reply(a.ok() ? a.text() : "", req.model(), a.inputTokens(), a.outputTokens(), 0, a.finishReason(), 0);
    }

    @Override
    public Judge.Result<JudgeResult> judge(Judge base, int repeat, String system, String prefix, String body) {
        String key = unit + "-" + base.name() + "-" + repeat;
        Answer a = known.get(key);
        BeanOutputConverter<JudgeResult> converter = new BeanOutputConverter<>(JudgeResult.class);
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

    @Override
    public Judge.Result<ReplayJudgement> compare(Judge judge, int turn, String system, String user) {
        String key = unit + "-c" + pad(turn);
        Answer a = known.get(key);
        BeanOutputConverter<ReplayJudgement> converter = new BeanOutputConverter<>(ReplayJudgement.class);
        if (a == null) {
            if (!last) {
                boolean claude = "claude".equals(judge.name());
                ObjectNode req = claude ? client.claudeJudgeParams(system, "", user, converter.getJsonSchema())
                        : client.openaiJudgeBody(system, "", user, converter.getJsonSchema());
                add(new Pending(key, claude ? "claude" : "openai", judge.model(), req));
            }
            return new Judge.Result<>(new ReplayJudgement(List.of()), 0, 0, 0);
        }
        if (!a.ok() || a.text().isBlank()) return new Judge.Result<>(new ReplayJudgement(List.of()), a.inputTokens(), a.outputTokens(), 0);
        try {
            return new Judge.Result<>(converter.convert(a.text()), a.inputTokens(), a.outputTokens(), a.cachedInputTokens());
        } catch (RuntimeException e) {
            return new Judge.Result<>(new ReplayJudgement(List.of()), a.inputTokens(), a.outputTokens(), 0);
        }
    }

    private void add(Pending p) {
        synchronized (pending) {
            pending.add(p);
        }
    }

    private static String pad(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }
}
