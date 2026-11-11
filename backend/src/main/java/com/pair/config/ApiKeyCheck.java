package com.pair.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** 서버가 켜질 때 API 키가 들어왔는지 알려 준다. 키 값은 로그에 남기지 않는다. */
@Component
public class ApiKeyCheck {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyCheck.class);

    private final AiKeys keys;

    public ApiKeyCheck(AiKeys keys) {
        this.keys = keys;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void check() {
        boolean openai = keys.hasOpenai();
        boolean anthropic = keys.hasAnthropic();
        if (openai && anthropic) {
            log.info("API 키 확인: OpenAI, Anthropic 모두 설정됨");
            return;
        }
        if (!openai) log.warn("OpenAI API 키가 없습니다. AI 어시스턴트와 OpenAI 채점을 쓸 수 없습니다. (환경 변수 OPENAI_API_KEY)");
        if (!anthropic) log.warn("Anthropic API 키가 없습니다. Claude 채점을 쓸 수 없습니다. (환경 변수 ANTHROPIC_API_KEY)");
    }
}
