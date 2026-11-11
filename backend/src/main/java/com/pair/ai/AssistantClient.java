package com.pair.ai;

import org.springframework.stereotype.Component;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.errors.OpenAIServiceException;
import com.openai.errors.RateLimitException;
import com.openai.errors.UnauthorizedException;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.pair.attempt.ChatTurn.AssistantRequest;
import com.pair.attempt.ChatTurn.Message;

/** 응시자가 쓰는 AI 어시스턴트 (OpenAI Chat Completions). R2 다시 실행도 이 클래스로 한다. */
@Component
public class AssistantClient {

    public record Reply(String text, String model, long inputTokens, long outputTokens, long latencyMs) {}

    private volatile OpenAIClient client;

    private OpenAIClient client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    String key = System.getenv("OPENAI_API_KEY");
                    if (key == null || key.isBlank()) {
                        throw new AiUnavailableException("OPENAI_API_KEY 환경 변수가 설정되지 않아 AI 어시스턴트를 호출할 수 없습니다.");
                    }
                    client = OpenAIOkHttpClient.fromEnv();
                }
            }
        }
        return client;
    }

    public Reply send(AssistantRequest req) {
        ChatCompletionCreateParams.Builder b = ChatCompletionCreateParams.builder()
                .model(req.model())
                .maxCompletionTokens(req.maxOutputTokens())
                .addSystemMessage(req.systemPrompt());
        for (Message m : req.messages()) {
            if ("user".equals(m.role())) b.addUserMessage(m.content());
            else b.addAssistantMessage(m.content());
        }
        long started = System.nanoTime();
        try {
            ChatCompletion res = client().chat().completions().create(b.build());
            long ms = (System.nanoTime() - started) / 1_000_000;
            String text = res.choices().isEmpty() ? ""
                    : res.choices().get(0).message().content()
                            .or(() -> res.choices().get(0).message().refusal().map(r -> "(응답 거절) " + r))
                            .orElse("");
            long in = res.usage().map(u -> u.promptTokens()).orElse(0L);
            long out = res.usage().map(u -> u.completionTokens()).orElse(0L);
            return new Reply(text, res.model(), in, out, ms);
        } catch (UnauthorizedException e) {
            throw new AiUnavailableException("OpenAI API 키가 올바르지 않습니다 (401).");
        } catch (RateLimitException e) {
            throw new AiUnavailableException("OpenAI 요청 한도에 걸렸습니다 (429). 잠시 후 다시 시도하세요.");
        } catch (OpenAIServiceException e) {
            throw new AiUnavailableException("OpenAI 호출 실패 (" + e.statusCode() + "): " + e.getMessage());
        }
    }
}
