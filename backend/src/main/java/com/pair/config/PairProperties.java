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

    /**
     * dataDir 와 grader.dir 같은 상대 경로는 저장소 최상위 폴더(pAIr) 기준으로 바꾼다.
     * IntelliJ 처럼 backend 폴더에서 실행해도 backend/grader, backend/pilot-data 가 새로 생기지 않게 한다.
     */
    public PairProperties {
        dataDir = fromRepoRoot(dataDir);
        if (grader != null) grader = new Grader(fromRepoRoot(grader.dir()), grader.parallel());
    }

    /** 실행 폴더에서 위로 올라가며 backend 와 grader 폴더가 함께 있는 곳(저장소 최상위)을 찾아 그 기준 경로를 돌려준다. */
    static String fromRepoRoot(String dir) {
        if (dir == null || java.nio.file.Path.of(dir).isAbsolute()) return dir;
        for (java.nio.file.Path base = java.nio.file.Path.of("").toAbsolutePath(); base != null; base = base.getParent()) {
            if (java.nio.file.Files.isDirectory(base.resolve("backend")) && java.nio.file.Files.isDirectory(base.resolve("grader"))) {
                return base.resolve(dir).toString();
            }
        }
        return dir;
    }

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
