package com.pair.ai;

import java.util.List;

import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.openai.api.ResponseFormat;
import org.springframework.stereotype.Component;

import com.pair.config.AiKeys;
import com.pair.config.PairProperties;

/**
 * 채점 모델 (Spring AI OpenAI). 구조화 출력(JSON 스키마)과 reasoning_effort 를 쓴다.
 * 프롬프트 앞부분이 같으면 OpenAI 가 자동으로 캐시한다.
 */
@Component
public class OpenAiJudge implements Judge {

    private final PairProperties.Model cfg;
    private final AiKeys keys;
    private volatile OpenAiChatModel chatModel;

    public OpenAiJudge(PairProperties props, AiKeys keys) {
        this.cfg = props.judge().openai();
        this.keys = keys;
    }

    @Override
    public String name() {
        return "openai";
    }

    @Override
    public String model() {
        return cfg.model();
    }

    private OpenAiChatModel chatModel() {
        if (chatModel == null) {
            synchronized (this) {
                if (chatModel == null) {
                    if (!keys.hasOpenai()) {
                        throw new AiUnavailableException("OpenAI API 키(spring.ai.openai.api-key, 환경 변수 OPENAI_API_KEY)가 없어 OpenAI 채점을 할 수 없습니다.");
                    }
                    chatModel = SpringAi.openAi(keys.openai());
                }
            }
        }
        return chatModel;
    }

    @Override
    public <T> Result<T> judge(String system, String cachedPrefix, String user, Class<T> type) {
        BeanOutputConverter<T> converter = new BeanOutputConverter<>(type);
        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder()
                .model(cfg.model())
                .maxCompletionTokens((int) cfg.maxTokens())
                .responseFormat(new ResponseFormat(ResponseFormat.Type.JSON_SCHEMA, converter.getJsonSchema()));
        if (cfg.effort() != null && !cfg.effort().isBlank()) options.reasoningEffort(cfg.effort());
        String sys = cachedPrefix == null || cachedPrefix.isBlank() ? system : system + "\n\n" + cachedPrefix;
        Prompt prompt = new Prompt(List.of(new SystemMessage(sys), new UserMessage(user)), options.build());
        ChatResponse res = SpringAi.call("OpenAI 채점", () -> chatModel().call(prompt));
        String text = SpringAi.text(res);
        if (text.isBlank()) {
            throw new AiUnavailableException("OpenAI 채점 모델 응답이 비어 있습니다 (finish=" + SpringAi.finishReason(res) + "). 출력 한도를 늘리거나 effort 를 낮추세요.");
        }
        T value;
        try {
            value = converter.convert(text);
        } catch (RuntimeException e) {
            throw new AiUnavailableException("OpenAI 채점 결과를 읽지 못했습니다: " + e.getMessage());
        }
        OpenAiApi.Usage u = res.getMetadata().getUsage().getNativeUsage() instanceof OpenAiApi.Usage x ? x : null;
        long in = u != null ? SpringAi.n(u.promptTokens()) : SpringAi.n(res.getMetadata().getUsage().getPromptTokens());
        long out = u != null ? SpringAi.n(u.completionTokens()) : SpringAi.n(res.getMetadata().getUsage().getCompletionTokens());
        long cached = u != null && u.promptTokensDetails() != null ? SpringAi.n(u.promptTokensDetails().cachedTokens()) : 0;
        return new Result<>(value, in, out, cached);
    }
}
