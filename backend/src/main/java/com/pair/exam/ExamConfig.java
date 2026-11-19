package com.pair.exam;

import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 회차 기능 공통 설정.
 * 시각은 모두 이 Clock(서버 시각)으로 정한다. 응시자 PC 시계는 믿지 않는다.
 * 테스트는 고정 시계로 바꿔 끼운다.
 */
@Configuration
@EnableScheduling
@EnableAsync
public class ExamConfig {

    @Bean
    @ConditionalOnMissingBean(Clock.class)
    Clock examClock() {
        return Clock.systemUTC();
    }
}
