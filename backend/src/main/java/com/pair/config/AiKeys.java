package com.pair.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Spring AI 표준 키 설정(spring.ai.openai.api-key, spring.ai.anthropic.api-key).
 * application.yml 에서 시스템 환경 변수(OPENAI_API_KEY, ANTHROPIC_API_KEY)를 가리킨다. 키 값은 파일에 쓰지 않는다.
 */
@Component
public class AiKeys {

    private final String openai;
    private final String anthropic;

    public AiKeys(@Value("${spring.ai.openai.api-key:}") String openai,
                  @Value("${spring.ai.anthropic.api-key:}") String anthropic) {
        this.openai = openai;
        this.anthropic = anthropic;
    }

    public String openai() {
        return openai;
    }

    public String anthropic() {
        return anthropic;
    }

    public boolean hasOpenai() {
        return openai != null && !openai.isBlank();
    }

    public boolean hasAnthropic() {
        return anthropic != null && !anthropic.isBlank();
    }
}
