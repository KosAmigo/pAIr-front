package com.pair.ai;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.errors.UnauthorizedException;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.StructuredMessage;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.pair.config.PairProperties;

/** 채점용 LLM (Anthropic). 응답은 구조화 출력(JSON 스키마)으로 받는다. */
@Component
public class JudgeClient {

    public record Result<T>(T value, long inputTokens, long outputTokens) {}

    private final PairProperties.Judge cfg;
    private volatile AnthropicClient client;

    public JudgeClient(PairProperties props) {
        this.cfg = props.judge();
    }

    private AnthropicClient client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) client = AnthropicOkHttpClient.fromEnv();
            }
        }
        return client;
    }

    public <T> Result<T> judge(String system, String user, Class<T> type) {
        StructuredMessageCreateParams<T> params = MessageCreateParams.builder()
                .model(cfg.model())
                .maxTokens(cfg.maxTokens())
                .system(system)
                .outputConfig(type)
                .addUserMessage(user)
                .build();
        try {
            StructuredMessage<T> res = client().messages().create(params);
            if (res.stopReason().map(r -> r.toString().equals("refusal")).orElse(false)) {
                throw new AiUnavailableException("채점 모델이 요청을 거절했습니다(refusal).");
            }
            Optional<T> value = res.content().stream().flatMap(cb -> cb.text().stream()).map(t -> t.text()).findFirst();
            T v = value.orElseThrow(() -> new AiUnavailableException("채점 모델 응답에 결과가 없습니다."));
            return new Result<>(v, res.usage().inputTokens(), res.usage().outputTokens());
        } catch (UnauthorizedException e) {
            throw new AiUnavailableException("Anthropic API 키가 올바르지 않습니다 (401).");
        } catch (RateLimitException e) {
            throw new AiUnavailableException("Anthropic 요청 한도에 걸렸습니다 (429).");
        } catch (AnthropicServiceException e) {
            throw new AiUnavailableException("Anthropic 호출 실패 (" + e.statusCode() + "): " + e.getMessage());
        } catch (IllegalStateException e) {
            // 키가 없을 때 클라이언트 생성 단계에서 나는 예외
            throw new AiUnavailableException("ANTHROPIC_API_KEY 환경 변수가 설정되지 않아 채점을 할 수 없습니다. (" + e.getMessage() + ")");
        }
    }
}
