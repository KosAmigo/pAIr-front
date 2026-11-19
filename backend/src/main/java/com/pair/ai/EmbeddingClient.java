package com.pair.ai;

import java.util.List;

import org.springframework.ai.document.MetadataMode;
import org.springframework.ai.embedding.EmbeddingRequest;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Component;

import com.pair.config.AiKeys;

/**
 * 문서 조각과 검색 문장의 임베딩 (OpenAI text-embedding-3-small, 1536차원).
 * 모델 선택 근거: docs/기술검증_보고서.md 12번.
 */
@Component
public class EmbeddingClient {

    public static final String MODEL = "text-embedding-3-small";

    private final AiKeys keys;
    private volatile OpenAiEmbeddingModel model;

    public EmbeddingClient(AiKeys keys) {
        this.keys = keys;
    }

    public record Result(List<float[]> vectors, long tokens) {}

    public Result embed(List<String> texts) {
        try {
            EmbeddingResponse res = model().call(new EmbeddingRequest(texts, null));
            List<float[]> vectors = res.getResults().stream().map(r -> r.getOutput()).toList();
            long tokens = res.getMetadata() != null && res.getMetadata().getUsage() != null
                    ? SpringAi.n(res.getMetadata().getUsage().getPromptTokens()) : 0;
            return new Result(vectors, tokens);
        } catch (AiUnavailableException e) {
            throw e;
        } catch (RuntimeException e) {
            throw SpringAi.unavailable("OpenAI 임베딩", e);
        }
    }

    private OpenAiEmbeddingModel model() {
        if (model == null) {
            synchronized (this) {
                if (model == null) {
                    if (!keys.hasOpenai()) {
                        throw new AiUnavailableException("OpenAI API 키(환경 변수 OPENAI_API_KEY)가 없어 문서 검색을 할 수 없습니다.");
                    }
                    model = new OpenAiEmbeddingModel(OpenAiApi.builder().apiKey(keys.openai()).build(), MetadataMode.EMBED,
                            OpenAiEmbeddingOptions.builder().model(MODEL).build());
                }
            }
        }
        return model;
    }
}
