package com.pair.exam.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import com.pair.exam.domain.ExamSession;

public interface ExamSessionRepository extends JpaRepository<ExamSession, Long> {

    @EntityGraph(attributePaths = "taskIds")
    List<ExamSession> findByCompanyIdOrderByStartsAtDesc(Long companyId);

    /** 종료 시각이 지났는데 아직 자동 제출 처리가 안 된 회차 */
    List<ExamSession> findByEndsAtLessThanEqualAndClosedAtIsNull(Instant now);
}
