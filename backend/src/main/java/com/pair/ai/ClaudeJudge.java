package com.pair.ai;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.errors.UnauthorizedException;
import com.anthropic.models.messages.CacheControlEphemeral;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.StructuredMessage;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.anthropic.models.messages.StructuredOutputConfig;
import com.anthropic.models.messages.TextBlockParam;
import com.pair.config.PairProperties;

/** 채점 모델 (Anthropic). 구조화 출력(JSON 스키마)과 추론 강도(effort)를 쓰고, 앞부분은 프롬프트 캐시로 둔다. */
@Component
public class ClaudeJudge implements Judge {

    private final PairProperties.Model cfg;
    private volatile AnthropicClient client;

    public ClaudeJudge(PairProperties props) {
        this.cfg = props.judge().claude();
    }

    @Override
    public String name() {
        return "claude";
    }

    @Override
    public String model() {
        return cfg.model();
    }

    private AnthropicClient client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) client = AnthropicOkHttpClient.fromEnv();
            }
        }
        return client;
    }

    @Override
    public <T> Result<T> judge(String system, String cachedPrefix, String user, Class<T> type) {
        StructuredOutputConfig.Builder<T> out = StructuredOutputConfig.<T>builder().format(type);
        if (cfg.effort() != null && !cfg.effort().isBlank()) out.effort(OutputConfig.Effort.of(cfg.effort()));
        // 시스템 블록 두 개: 채점 규칙 + (과제, 정답, 체크 항목). 두 번째 블록 끝에 캐시 지점을 둔다.
        // (빈 텍스트 블록은 API 가 거절하므로 앞부분이 없으면 규칙 블록 하나만 보낸다)
        List<TextBlockParam> systemBlocks = cachedPrefix == null || cachedPrefix.isBlank()
                ? List.of(TextBlockParam.builder().text(system).build())
                : List.of(
                        TextBlockParam.builder().text(system).build(),
                        TextBlockParam.builder().text(cachedPrefix)
                                .cacheControl(CacheControlEphemeral.builder().build()).build());
        StructuredMessageCreateParams<T> params = MessageCreateParams.builder()
                .model(cfg.model())
                .maxTokens(cfg.maxTokens())
                .systemOfTextBlockParams(systemBlocks)
                .outputConfig(out.build())
                .addUserMessage(user)
                .build();
        try {
            StructuredMessage<T> res = client().messages().create(params);
            if (res.stopReason().map(r -> r.toString().equals("refusal")).orElse(false)) {
                throw new AiUnavailableException("Claude 채점 모델이 요청을 거절했습니다(refusal).");
            }
            Optional<T> value = res.content().stream().flatMap(cb -> cb.text().stream()).map(t -> t.text()).findFirst();
            T v = value.orElseThrow(() -> new AiUnavailableException("Claude 채점 모델 응답에 결과가 없습니다."));
            var u = res.usage();
            long cacheRead = u.cacheReadInputTokens().orElse(0L);
            long cacheWrite = u.cacheCreationInputTokens().orElse(0L);
            // Anthropic 의 input_tokens 는 캐시 부분을 뺀 나머지라서 합쳐서 전체 입력으로 기록한다
            return new Result<>(v, u.inputTokens() + cacheRead + cacheWrite, u.outputTokens(), cacheRead);
        } catch (UnauthorizedException e) {
            throw new AiUnavailableException("Anthropic API 키가 올바르지 않습니다 (401).");
        } catch (RateLimitException e) {
            throw new AiUnavailableException("Anthropic 요청 한도에 걸렸습니다 (429).");
        } catch (AnthropicServiceException e) {
            throw new AiUnavailableException("Anthropic 호출 실패 (" + e.statusCode() + "): " + e.getMessage());
        } catch (IllegalStateException e) {
            throw new AiUnavailableException("ANTHROPIC_API_KEY 환경 변수가 설정되지 않아 채점을 할 수 없습니다. (" + e.getMessage() + ")");
        }
    }
}
