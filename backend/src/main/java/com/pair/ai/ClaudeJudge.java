package com.pair.ai;

import java.util.List;

import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.anthropic.AnthropicChatOptions;
import org.springframework.ai.anthropic.api.AnthropicApi;
import org.springframework.ai.anthropic.api.AnthropicCacheOptions;
import org.springframework.ai.anthropic.api.AnthropicCacheStrategy;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.stereotype.Component;

import com.pair.config.AiKeys;
import com.pair.config.PairProperties;

/**
 * 채점 모델 (Spring AI Anthropic). 구조화 출력(JSON 스키마)을 쓰고, 시스템 프롬프트(채점 규칙 + 과제, 정답, 체크 항목)는 프롬프트 캐시로 둔다.
 * 추론 강도(effort)는 Spring AI 1.1 에 옵션이 없어 요청에 직접 넣는다 (AnthropicEffortInterceptor).
 */
@Component
public class ClaudeJudge implements Judge {

    private final PairProperties.Model cfg;
    private final AiKeys keys;
    private volatile AnthropicChatModel chatModel;

    public ClaudeJudge(PairProperties props, AiKeys keys) {
        this.cfg = props.judge().claude();
        this.keys = keys;
    }

    @Override
    public String name() {
        return "claude";
    }

    @Override
    public String model() {
        return cfg.model();
    }

    private AnthropicChatModel chatModel() {
        if (chatModel == null) {
            synchronized (this) {
                if (chatModel == null) {
                    if (!keys.hasAnthropic()) {
                        throw new AiUnavailableException("Anthropic API 키(spring.ai.anthropic.api-key, 환경 변수 ANTHROPIC_API_KEY)가 없어 Claude 채점을 할 수 없습니다.");
                    }
                    chatModel = SpringAi.anthropic(keys.anthropic(), cfg.effort());
                }
            }
        }
        return chatModel;
    }

    @Override
    public <T> Result<T> judge(String system, String cachedPrefix, String user, Class<T> type) {
        BeanOutputConverter<T> converter = new BeanOutputConverter<>(type);
        AnthropicChatOptions options = AnthropicChatOptions.builder()
                .model(cfg.model())
                .maxTokens((int) cfg.maxTokens())
                .outputSchema(converter.getJsonSchema())
                .cacheOptions(AnthropicCacheOptions.builder().strategy(AnthropicCacheStrategy.SYSTEM_ONLY).build())
                .build();
        String sys = cachedPrefix == null || cachedPrefix.isBlank() ? system : system + "\n\n" + cachedPrefix;
        Prompt prompt = new Prompt(List.of(new SystemMessage(sys), new UserMessage(user)), options);
        ChatResponse res = SpringAi.call("Claude 채점", () -> chatModel().call(prompt));
        String finish = SpringAi.finishReason(res);
        if (finish.contains("refusal")) throw new AiUnavailableException("Claude 채점 모델이 요청을 거절했습니다(refusal).");
        String text = SpringAi.text(res);
        if (text.isBlank()) throw new AiUnavailableException("Claude 채점 모델 응답에 결과가 없습니다 (finish=" + finish + ").");
        T value;
        try {
            value = converter.convert(text);
        } catch (RuntimeException e) {
            throw new AiUnavailableException("Claude 채점 결과를 읽지 못했습니다: " + e.getMessage());
        }
        AnthropicApi.Usage u = res.getMetadata().getUsage().getNativeUsage() instanceof AnthropicApi.Usage x ? x : null;
        if (u == null) {
            return new Result<>(value, SpringAi.n(res.getMetadata().getUsage().getPromptTokens()),
                    SpringAi.n(res.getMetadata().getUsage().getCompletionTokens()), 0);
        }
        long cacheRead = SpringAi.n(u.cacheReadInputTokens());
        long cacheWrite = SpringAi.n(u.cacheCreationInputTokens());
        // Anthropic 의 input_tokens 는 캐시 부분을 뺀 나머지라서 합쳐서 전체 입력으로 기록한다
        return new Result<>(value, SpringAi.n(u.inputTokens()) + cacheRead + cacheWrite, SpringAi.n(u.outputTokens()), cacheRead);
    }
}
