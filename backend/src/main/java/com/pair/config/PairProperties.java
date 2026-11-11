package com.pair.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "pair")
public record PairProperties(
        String dataDir,
        Assistant assistant,
        Judge judge,
        String claudeAssistantModel,
        Run run,
        R2 r2) {

    public record Assistant(String provider, String model, long maxOutputTokens, int maxTurns, int maxInputChars, String systemPrompt) {}

    public record Judge(String model, long maxTokens) {}

    public record Run(int timeoutSeconds) {}

    public record R2(int maxKeyTurns, int replaysPerTurn) {}
}
