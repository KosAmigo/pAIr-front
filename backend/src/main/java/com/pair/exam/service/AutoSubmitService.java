package com.pair.exam.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.repository.ExamParticipantRepository;
import com.pair.exam.repository.ExamSessionRepository;

/**
 * 종료 시각이 지난 회차를 닫는다: 시작했지만 아직 제출하지 않은 응시자를 전원 자동 제출.
 * 시작하지 않은 대상자는 미응시로 남긴다.
 * 회차마다 트랜잭션을 따로 잡아서, 한 회차가 실패해도 다른 회차는 닫힌다.
 */
@Service
public class AutoSubmitService {
    private static final Logger log = LoggerFactory.getLogger(AutoSubmitService.class);

    private final ExamSessionRepository sessions;
    private final ExamParticipantRepository participants;
    private final AttemptSubmitter attempts;
    private final Clock clock;

    public AutoSubmitService(ExamSessionRepository sessions, ExamParticipantRepository participants,
            AttemptSubmitter attempts, Clock clock) {
        this.sessions = sessions;
        this.participants = participants;
        this.attempts = attempts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Long> dueSessionIds() {
        return sessions.findByEndsAtLessThanEqualAndClosedAtIsNull(clock.instant()).stream().map(ExamSession::getId).toList();
    }

    /** @return 자동 제출한 응시자 수 */
    @Transactional
    public int close(Long sessionId) {
        Instant now = clock.instant();
        ExamSession s = sessions.findById(sessionId).orElse(null);
        if (s == null || s.getClosedAt() != null || s.phase(now) != ExamSession.Phase.ENDED) return 0;

        // 응시자가 같은 순간 직접 제출하는 것과 겹치지 않도록 잠근다
        List<ExamParticipant> ps = participants.lockBySessionId(sessionId);
        int submitted = 0;
        for (ExamParticipant p : ps) {
            if (p.getStartedAt() == null || p.getSubmittedAt() != null) continue;
            attempts.submitAll(p.getAttempts());
            p.markSubmitted(now, ExamParticipant.SubmitKind.AUTO);
            submitted++;
        }
        s.close(now);
        long lagMs = Duration.between(s.getEndsAt(), now).toMillis();
        log.info("회차 {} 종료: 자동 제출 {}명, 종료 시각 대비 {}ms 뒤 처리", sessionId, submitted, lagMs);
        return submitted;
    }
}
