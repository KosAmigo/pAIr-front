package com.pair.ai;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Component;

import com.pair.attempt.ChatTurn.AssistantRequest;
import com.pair.config.AiKeys;

/** 응시자가 쓰는 AI 어시스턴트 (Spring AI OpenAI). R1 다시 실행도 이 클래스로 한다. */
@Component
public class AssistantClient {

    /** finishReason: stop, length(한도에 걸려 잘림) 등. reasoningTokens: 추론에 쓴 토큰(출력 토큰에 포함, 출력 가격으로 과금). */
    public record Reply(String text, String model, long inputTokens, long outputTokens, long reasoningTokens, String finishReason, long latencyMs) {}

    private final AiKeys keys;
    private volatile OpenAiChatModel chatModel;

    public AssistantClient(AiKeys keys) {
        this.keys = keys;
    }

    private OpenAiChatModel chatModel() {
        if (chatModel == null) {
            synchronized (this) {
                if (chatModel == null) {
                    if (!keys.hasOpenai()) {
                        throw new AiUnavailableException("OpenAI API 키(spring.ai.openai.api-key, 환경 변수 OPENAI_API_KEY)가 없어 AI 어시스턴트를 호출할 수 없습니다.");
                    }
                    chatModel = SpringAi.openAi(keys.openai());
                }
            }
        }
        return chatModel;
    }

    /**
     * 스트리밍 호출: 답변 글자가 오는 대로 onDelta 로 넘기고, 끝나면 전체 답변을 돌려준다.
     * 사용량(토큰)은 마지막 조각에 실려 오도록 stream_options.include_usage 를 켠다.
     */
    public Reply stream(AssistantRequest req, Consumer<String> onDelta) {
        Prompt prompt = prompt(req, true);
        StringBuilder text = new StringBuilder();
        long[] usage = new long[3]; // 입력, 출력, 추론
        String[] meta = {req.model(), "none"};
        long started = System.nanoTime();
        try {
            chatModel().stream(prompt).doOnNext(chunk -> {
                for (Generation g : chunk.getResults()) {
                    String t = g.getOutput() == null ? null : g.getOutput().getText();
                    if (t != null && !t.isEmpty()) {
                        text.append(t);
                        onDelta.accept(t);
                    }
                    String f = g.getMetadata() == null ? null : g.getMetadata().getFinishReason();
                    if (f != null && !f.isBlank()) meta[1] = f.toLowerCase();
                }
                if (chunk.getMetadata() != null) {
                    if (chunk.getMetadata().getModel() != null && !chunk.getMetadata().getModel().isBlank()) meta[0] = chunk.getMetadata().getModel();
                    var u = chunk.getMetadata().getUsage();
                    if (u != null) {
                        usage[0] = Math.max(usage[0], SpringAi.n(u.getPromptTokens()));
                        usage[1] = Math.max(usage[1], SpringAi.n(u.getCompletionTokens()));
                        if (u.getNativeUsage() instanceof OpenAiApi.Usage x && x.completionTokenDetails() != null) {
                            usage[2] = Math.max(usage[2], SpringAi.n(x.completionTokenDetails().reasoningTokens()));
                        }
                    }
                }
            }).blockLast(Duration.ofMinutes(5));
        } catch (AiUnavailableException e) {
            throw e;
        } catch (RuntimeException e) {
            throw SpringAi.unavailable("OpenAI", e);
        }
        long ms = (System.nanoTime() - started) / 1_000_000;
        return new Reply(text.toString(), meta[0], usage[0], usage[1], usage[2], meta[1], ms);
    }

    private Prompt prompt(AssistantRequest req, boolean streamUsage) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(req.systemPrompt()));
        for (com.pair.attempt.ChatTurn.Message m : req.messages()) {
            messages.add("user".equals(m.role()) ? new UserMessage(m.content()) : new AssistantMessage(m.content()));
        }
        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder()
                .model(req.model())
                .maxCompletionTokens((int) req.maxOutputTokens());
        if (req.reasoningEffort() != null && !req.reasoningEffort().isBlank()) options.reasoningEffort(req.reasoningEffort());
        if (streamUsage) options.streamUsage(true);
        return new Prompt(messages, options.build());
    }

    public Reply send(AssistantRequest req) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(req.systemPrompt()));
        for (com.pair.attempt.ChatTurn.Message m : req.messages()) {
            messages.add("user".equals(m.role()) ? new UserMessage(m.content()) : new AssistantMessage(m.content()));
        }
        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder()
                .model(req.model())
                .maxCompletionTokens((int) req.maxOutputTokens());
        if (req.reasoningEffort() != null && !req.reasoningEffort().isBlank()) options.reasoningEffort(req.reasoningEffort());
        long started = System.nanoTime();
        ChatResponse res = SpringAi.call("OpenAI", () -> chatModel().call(new Prompt(messages, options.build())));
        long ms = (System.nanoTime() - started) / 1_000_000;
        String text = SpringAi.text(res);
        OpenAiApi.Usage u = res.getMetadata().getUsage().getNativeUsage() instanceof OpenAiApi.Usage x ? x : null;
        long in = u != null && u.promptTokens() != null ? u.promptTokens() : SpringAi.n(res.getMetadata().getUsage().getPromptTokens());
        long out = u != null && u.completionTokens() != null ? u.completionTokens() : SpringAi.n(res.getMetadata().getUsage().getCompletionTokens());
        long reasoning = u != null && u.completionTokenDetails() != null ? SpringAi.n(u.completionTokenDetails().reasoningTokens()) : 0;
        String model = res.getMetadata().getModel() == null || res.getMetadata().getModel().isBlank() ? req.model() : res.getMetadata().getModel();
        return new Reply(text, model, in, out, reasoning, SpringAi.finishReason(res), ms);
    }
}
