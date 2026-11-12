package com.pair.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "pair")
public record PairProperties(
        String dataDir,
        Assistant assistant,
        Judge judge,
        String claudeAssistantModel,
        Run run,
        R2 r2,
        Grader grader,
        java.util.Map<String, Price> pricing) {

    public record Assistant(String provider, String model, long maxOutputTokens, String reasoningEffort, int maxTurns, int maxInputChars, String systemPrompt) {}

    /**
     * 이중 채점: 판정 체크는 두 모델이 모두 "걸림"이라고 할 때만 감점한다.
     * replayCompare: 다시 실행(R1) 비교에 쓸 채점 모델 (claude | openai)
     */
    public record Judge(Model claude, Model openai, String replayCompare) {}

    /** effort: OpenAI 는 reasoning_effort(none/minimal/low/medium/high). Claude 는 output_config.effort(low/medium/high/xhigh/max). */
    public record Model(String model, String effort, long maxTokens) {}

    public record Run(int timeoutSeconds) {}

    public record R2(int maxKeyTurns, int replaysPerTurn) {}

    /** 채점 툴. dir: 프롬프트 버전과 샘플 응시 폴더(git 공유). parallel: 동시에 채점할 개수. */
    public record Grader(String dir, int parallel) {}

    /** 모델 가격 ($/1M 토큰). 채점 예상 비용 계산에 쓴다. */
    public record Price(double input, double output) {}
}
