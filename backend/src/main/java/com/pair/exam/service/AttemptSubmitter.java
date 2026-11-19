package com.pair.exam.service;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.pair.attempt.Attempt;
import com.pair.attempt.AttemptService;
import com.pair.attempt.AttemptStore;

/**
 * 회차와 기존 응시(attempt, 파일 저장) 사이의 경계.
 * 아직 풀고 있는(SOLVING) 응시만 제출한다. 이미 제출했거나 후속 질문 단계면 건드리지 않는다.
 * 제출 뒤 후속 질문·채점 큐는 팀원 1 영역(AttemptService)이 이어 받는다.
 */
@Component
public class AttemptSubmitter {
    private static final Logger log = LoggerFactory.getLogger(AttemptSubmitter.class);

    private final AttemptService attempts;
    private final AttemptStore store;

    public AttemptSubmitter(AttemptService attempts, AttemptStore store) {
        this.attempts = attempts;
        this.store = store;
    }

    public String start(String taskId) {
        return attempts.start(taskId).id();
    }

    /** @return 실제로 제출한 응시 수 */
    public int submitAll(Map<String, String> taskToAttempt) {
        int n = 0;
        for (String attemptId : taskToAttempt.values()) {
            try {
                if (store.load(attemptId).status() != Attempt.Status.SOLVING) continue;
                attempts.submit(attemptId);
                n++;
            } catch (IllegalStateException e) {
                // 그 사이 응시자가 직접 제출한 경우
                log.debug("이미 제출된 응시: {}", attemptId);
            } catch (RuntimeException e) {
                // 한 응시 파일이 깨져도 나머지 응시자의 제출은 계속한다
                log.error("응시 제출 실패: {}", attemptId, e);
            }
        }
        return n;
    }
}
