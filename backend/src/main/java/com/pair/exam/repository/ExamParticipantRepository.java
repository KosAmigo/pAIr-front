package com.pair.exam.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.pair.exam.domain.ExamParticipant;

import jakarta.persistence.LockModeType;

public interface ExamParticipantRepository extends JpaRepository<ExamParticipant, Long> {

    /** 회차별 인원 집계 한 줄 (목록 화면에서 회차마다 따로 세지 않도록 한 번에 묶는다) */
    interface SessionCounts {
        Long getSessionId();
        long getTotal();
        long getEntered();
        long getSubmitted();
    }

    @EntityGraph(attributePaths = {"session", "attempts"})
    Optional<ExamParticipant> findByInviteToken(String inviteToken);

    /** 시작·제출처럼 두 번 눌리면 안 되는 요청용. 같은 대상자의 요청은 줄을 세운다 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ExamParticipant p join fetch p.session where p.inviteToken = :token")
    Optional<ExamParticipant> lockByInviteToken(@Param("token") String token);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ExamParticipant p where p.session.id = :sessionId order by p.id")
    List<ExamParticipant> lockBySessionId(@Param("sessionId") Long sessionId);

    @EntityGraph(attributePaths = "attempts")
    List<ExamParticipant> findBySessionIdOrderByIdAsc(Long sessionId);

    @Query("select p.email from ExamParticipant p where p.session.id = :sessionId and lower(p.email) in :emails")
    List<String> findExistingEmails(@Param("sessionId") Long sessionId, @Param("emails") Collection<String> emails);

    @Query("""
            select p.session.id as sessionId, count(p) as total,
                   count(p.enteredAt) as entered, count(p.submittedAt) as submitted
            from ExamParticipant p where p.session.id in :sessionIds group by p.session.id
            """)
    List<SessionCounts> countBySessionIds(@Param("sessionIds") Collection<Long> sessionIds);
}
