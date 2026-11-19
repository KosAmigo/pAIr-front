package com.pair.exam.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.pair.exam.domain.ProctorEvent;

public interface ProctorEventRepository extends JpaRepository<ProctorEvent, Long> {

    List<ProctorEvent> findByParticipantIdOrderByStartedAtAsc(Long participantId);

    /** 대상자·유형별 건수 (회차 결과 화면용, 대상자 전원을 한 번에) */
    interface TypeCount {
        Long getParticipantId();
        ProctorEvent.Type getType();
        long getCount();
    }

    @Query("""
            select e.participantId as participantId, e.type as type, count(e) as count
            from ProctorEvent e where e.participantId in :participantIds group by e.participantId, e.type
            """)
    List<TypeCount> countByParticipantAndType(@Param("participantIds") Collection<Long> participantIds);

    @Query("select coalesce(sum(e.snapshotBytes), 0) from ProctorEvent e where e.participantId in :participantIds")
    long sumSnapshotBytes(@Param("participantIds") Collection<Long> participantIds);

    /** 보관 기간이 지난 사진 (한 번에 너무 많이 잡지 않게 Pageable 로 끊는다) */
    @Query("""
            select e from ProctorEvent e
            where e.snapshotKey is not null and e.snapshotDeletedAt is null and e.receivedAt < :before
            order by e.receivedAt
            """)
    List<ProctorEvent> findExpiredSnapshots(@Param("before") Instant before, Pageable page);
}
