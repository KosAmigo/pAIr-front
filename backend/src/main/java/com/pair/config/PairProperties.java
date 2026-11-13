package com.pair.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "pair")
public record PairProperties(
        String dataDir,
        Assistant assistant,
        Judge judge,
        String claudeAssistantModel,
        Run run,
        Grader grader,
        java.util.Map<String, Price> pricing) {

    public record Assistant(String provider, String model, long maxOutputTokens, String reasoningEffort, int maxTurns, int maxInputChars, String systemPrompt) {}

    /** 이중 채점: 판정 체크는 두 모델의 감점을 평균한다. */
    public record Judge(Model claude, Model openai) {}

    /** effort: OpenAI 는 reasoning_effort(none/minimal/low/medium/high). Claude 는 output_config.effort(low/medium/high/xhigh/max). */
    public record Model(String model, String effort, long maxTokens) {}

    public record Run(int timeoutSeconds) {}

    /** 채점 툴. dir: 프롬프트 버전과 샘플 응시 폴더(git 공유). parallel: 동시에 채점할 개수. */
    public record Grader(String dir, int parallel) {}

    /** 모델 가격 ($/1M 토큰). 채점 예상 비용 계산에 쓴다. */
    public record Price(double input, double output) {}
}
