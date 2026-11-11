package com.pair.ai;

import java.util.List;
import java.util.function.Supplier;

import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.anthropic.AnthropicChatOptions;
import org.springframework.ai.anthropic.api.AnthropicApi;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.retry.NonTransientAiException;
import org.springframework.ai.retry.TransientAiException;
import org.springframework.web.client.RestClient;

/**
 * Spring AI 모델 생성과 공통 처리.
 * Spring AI 자동 설정은 기본 temperature(OpenAI 0.7, Anthropic 0.8)를 넣는데, 최신 추론 모델은 temperature 를 받지 않는다.
 * 그래서 모델은 빌더로 직접 만들고 temperature 는 비워 둔다(모델 기본값 사용). 모델 이름과 옵션은 호출마다 넘긴다.
 */
final class SpringAi {

    private SpringAi() {
    }

    static OpenAiChatModel openAi(String apiKey) {
        return OpenAiChatModel.builder()
                .openAiApi(OpenAiApi.builder().apiKey(apiKey).build())
                .defaultOptions(OpenAiChatOptions.builder().build())
                .build();
    }

    /** effort: 추론 강도(low/medium/high/...). Spring AI 1.1 에 옵션이 없어 요청에 직접 넣는다 (AnthropicEffortInterceptor). */
    static AnthropicChatModel anthropic(String apiKey, String effort) {
        RestClient.Builder rest = RestClient.builder().requestInterceptor(new AnthropicEffortInterceptor(effort));
        return AnthropicChatModel.builder()
                .anthropicApi(AnthropicApi.builder().apiKey(apiKey).restClientBuilder(rest).build())
                .defaultOptions(AnthropicChatOptions.builder().build())
                .build();
    }

    /** 호출하고, Spring AI 예외를 화면에 보여 줄 수 있는 AiUnavailableException 으로 바꾼다. */
    static ChatResponse call(String provider, Supplier<ChatResponse> call) {
        try {
            ChatResponse res = call.get();
            if (res == null) throw new AiUnavailableException(provider + " 응답이 비어 있습니다.");
            return res;
        } catch (NonTransientAiException e) {
            String m = String.valueOf(e.getMessage());
            if (m.contains("401")) throw new AiUnavailableException(provider + " API 키가 올바르지 않습니다 (401).");
            throw new AiUnavailableException(provider + " 호출 실패: " + shorten(m));
        } catch (TransientAiException e) {
            String m = String.valueOf(e.getMessage());
            if (m.contains("429")) throw new AiUnavailableException(provider + " 요청 한도에 걸렸습니다 (429). 잠시 후 다시 시도하세요.");
            throw new AiUnavailableException(provider + " 호출 실패(일시 오류): " + shorten(m));
        }
    }

    /**
     * 답변 본문. Claude 최신 모델은 생각(thinking) 블록을 먼저 보내는데, Spring AI 1.1 은 블록마다 결과(Generation)를 하나씩 만든다.
     * 생각 블록은 글이 비어 있으므로(표시 생략이 기본) 글이 있는 마지막 결과를 쓴다.
     */
    static String text(ChatResponse res) {
        Generation g = answer(res);
        if (g == null || g.getOutput() == null || g.getOutput().getText() == null) return "";
        return g.getOutput().getText();
    }

    static String finishReason(ChatResponse res) {
        Generation g = answer(res);
        if (g == null || g.getMetadata() == null) return "none";
        String f = g.getMetadata().getFinishReason();
        return f == null ? "none" : f.toLowerCase();
    }

    private static Generation answer(ChatResponse res) {
        List<Generation> all = res.getResults();
        if (all == null || all.isEmpty()) return null;
        for (int i = all.size() - 1; i >= 0; i--) {
            Generation g = all.get(i);
            if (g.getOutput() != null && g.getOutput().getText() != null && !g.getOutput().getText().isBlank()) return g;
        }
        return all.get(all.size() - 1);
    }

    static long n(Integer v) {
        return v == null ? 0 : v;
    }

    private static String shorten(String s) {
        return s.length() > 400 ? s.substring(0, 400) + "..." : s;
    }
}
