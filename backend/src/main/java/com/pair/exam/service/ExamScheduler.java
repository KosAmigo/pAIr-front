package com.pair.exam.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 주기 작업: 종료된 회차 자동 제출, 보관 기간 지난 감독 사진 삭제.
 * 서버가 여러 대가 되면 ShedLock 같은 분산 잠금이 필요하다 (지금은 한 대 기준).
 * 테스트에서는 pair.exam.scheduler-enabled=false 로 끄고 서비스를 직접 부른다.
 */
@Component
@ConditionalOnProperty(name = "pair.exam.scheduler-enabled", havingValue = "true", matchIfMissing = true)
public class ExamScheduler {
    private static final Logger log = LoggerFactory.getLogger(ExamScheduler.class);
    private static final long ONE_HOUR_MS = 3_600_000;

    private final AutoSubmitService autoSubmit;
    private final ProctorService proctor;

    public ExamScheduler(AutoSubmitService autoSubmit, ProctorService proctor) {
        this.autoSubmit = autoSubmit;
        this.proctor = proctor;
    }

    @Scheduled(fixedDelayString = "${pair.exam.auto-submit-interval-ms:2000}")
    public void closeEndedSessions() {
        for (Long id : autoSubmit.dueSessionIds()) {
            try {
                autoSubmit.close(id);
            } catch (RuntimeException e) {
                log.error("회차 {} 자동 제출 실패. 다음 주기에 다시 시도합니다.", id, e);
            }
        }
    }

    @Scheduled(fixedDelay = ONE_HOUR_MS, initialDelay = 60_000)
    public void purgeSnapshots() {
        try {
            int n = proctor.purgeExpiredSnapshots();
            if (n > 0) log.info("보관 기간이 지난 감독 사진 {}장 삭제", n);
        } catch (RuntimeException e) {
            log.error("감독 사진 정리 실패", e);
        }
    }
}
