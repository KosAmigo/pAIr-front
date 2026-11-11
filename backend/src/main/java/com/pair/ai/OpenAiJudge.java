package com.pair.ai;

import org.springframework.stereotype.Component;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.errors.OpenAIServiceException;
import com.openai.errors.RateLimitException;
import com.openai.errors.UnauthorizedException;
import com.openai.models.ReasoningEffort;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.chat.completions.StructuredChatCompletion;
import com.openai.models.chat.completions.StructuredChatCompletionCreateParams;
import com.pair.config.PairProperties;

/** 채점 모델 (OpenAI). 구조화 출력과 reasoning_effort 를 쓴다. 앞부분이 같으면 OpenAI 가 자동으로 캐시한다. */
@Component
public class OpenAiJudge implements Judge {

    private final PairProperties.Model cfg;
    private volatile OpenAIClient client;

    public OpenAiJudge(PairProperties props) {
        this.cfg = props.judge().openai();
    }

    @Override
    public String name() {
        return "openai";
    }

    @Override
    public String model() {
        return cfg.model();
    }

    private OpenAIClient client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    String key = System.getenv("OPENAI_API_KEY");
                    if (key == null || key.isBlank()) {
                        throw new AiUnavailableException("OPENAI_API_KEY 환경 변수가 설정되지 않아 OpenAI 채점을 할 수 없습니다.");
                    }
                    client = OpenAIOkHttpClient.fromEnv();
                }
            }
        }
        return client;
    }

    @Override
    public <T> Result<T> judge(String system, String cachedPrefix, String user, Class<T> type) {
        StructuredChatCompletionCreateParams.Builder<T> b = ChatCompletionCreateParams.builder()
                .model(cfg.model())
                .maxCompletionTokens(cfg.maxTokens())
                .responseFormat(type)
                .addSystemMessage(cachedPrefix == null || cachedPrefix.isBlank() ? system : system + "\n\n" + cachedPrefix)
                .addUserMessage(user);
        if (cfg.effort() != null && !cfg.effort().isBlank()) b.reasoningEffort(ReasoningEffort.of(cfg.effort()));
        try {
            StructuredChatCompletion<T> res = client().chat().completions().create(b.build());
            if (res.choices().isEmpty()) throw new AiUnavailableException("OpenAI 채점 모델 응답에 결과가 없습니다.");
            var choice = res.choices().get(0);
            if (choice.message().refusal().isPresent()) {
                throw new AiUnavailableException("OpenAI 채점 모델이 요청을 거절했습니다: " + choice.message().refusal().get());
            }
            T v = choice.message().content().orElseThrow(() -> new AiUnavailableException(
                    "OpenAI 채점 모델 응답이 비어 있습니다 (finish=" + choice.finishReason() + "). 출력 한도를 늘리거나 effort 를 낮추세요."));
            long in = res.usage().map(u -> u.promptTokens()).orElse(0L);
            long out = res.usage().map(u -> u.completionTokens()).orElse(0L);
            long cached = res.usage().flatMap(u -> u.promptTokensDetails()).flatMap(d -> d.cachedTokens()).orElse(0L);
            return new Result<>(v, in, out, cached);
        } catch (UnauthorizedException e) {
            throw new AiUnavailableException("OpenAI API 키가 올바르지 않습니다 (401).");
        } catch (RateLimitException e) {
            throw new AiUnavailableException("OpenAI 요청 한도에 걸렸습니다 (429).");
        } catch (OpenAIServiceException e) {
            throw new AiUnavailableException("OpenAI 호출 실패 (" + e.statusCode() + "): " + e.getMessage());
        }
    }
}
