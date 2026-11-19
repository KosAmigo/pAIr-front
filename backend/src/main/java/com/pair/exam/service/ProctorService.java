package com.pair.exam.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pair.exam.ExamProperties;
import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.domain.ProctorEvent;
import com.pair.exam.repository.ExamParticipantRepository;
import com.pair.exam.repository.ProctorEventRepository;
import com.pair.exam.web.ExamDtos.ProctorEventRequest;
import com.pair.exam.web.ExamDtos.ProctorEventView;

/**
 * 감독 이벤트 수신과 사진 보관.
 * 응시자 브라우저가 이상 순간에만 이벤트 1건 + 사진 1장을 보낸다 (영상은 받지 않는다).
 * 브라우저 아웃박스가 끊겼다가 나중에 몰아서 보낼 수 있어서, 종료 뒤 잠깐(LATE_GRACE)은 받는다.
 */
@Service
public class ProctorService {

    private static final Duration LATE_GRACE = Duration.ofMinutes(5);
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(1);
    private static final int MAX_DETAIL_CHARS = 4000;
    private static final int PURGE_BATCH = 500;

    private final ExamParticipantRepository participants;
    private final ProctorEventRepository events;
    private final SnapshotValidator snapshots;
    private final SnapshotStorage storage;
    private final ObjectMapper json;
    private final ExamProperties props;
    private final Clock clock;

    public ProctorService(ExamParticipantRepository participants, ProctorEventRepository events, SnapshotValidator snapshots,
            SnapshotStorage storage, ObjectMapper json, ExamProperties props, Clock clock) {
        this.participants = participants;
        this.events = events;
        this.snapshots = snapshots;
        this.storage = storage;
        this.json = json;
        this.props = props;
        this.clock = clock;
    }

    @Transactional
    public ProctorEventView record(String token, ProctorEventRequest req) {
        Instant now = clock.instant();
        ExamParticipant p = findParticipant(token);
        ExamSession s = p.getSession();
        if (!s.isProctoring()) throw new IllegalStateException("감독을 쓰지 않는 회차입니다.");
        if (p.getStartedAt() == null) throw new IllegalStateException("시작하지 않은 시험입니다.");
        if (now.isAfter(s.getEndsAt().plus(LATE_GRACE))) throw new IllegalStateException("끝난 시험의 감독 이벤트는 받지 않습니다.");
        if (req.startedAt().isBefore(s.getStartsAt().minus(CLOCK_SKEW)) || req.startedAt().isAfter(now.plus(CLOCK_SKEW))) {
            throw new IllegalArgumentException("이벤트 시각이 시험 시간 밖입니다.");
        }

        byte[] jpeg = req.snapshot() == null || req.snapshot().isBlank() ? null : snapshots.decode(req.snapshot());
        if (jpeg != null && req.source() == ProctorEvent.Source.BROWSER) {
            throw new IllegalArgumentException("브라우저 이벤트에는 사진을 붙이지 않습니다.");
        }
        ProctorEvent e = events.save(new ProctorEvent(p.getId(), req.type(), req.source(), req.startedAt(), req.durationMs(),
                req.confidence(), detail(req), now));
        if (jpeg != null) {
            // 파일 서버 업로드가 실패하면 예외 → 이벤트도 롤백 → 브라우저 아웃박스가 다시 보낸다.
            // (반대로 업로드 뒤 커밋만 실패하면 파일 서버에 주인 없는 사진이 남을 수 있다. 사진이 빠진 기록보다 낫다)
            String key = SnapshotStorage.keyOf(s.getId(), e.getId());
            storage.put(key, jpeg);
            e.attachSnapshot(key, jpeg.length);
        }
        return ProctorEventView.from(e);
    }

    @Transactional(readOnly = true)
    public List<ProctorEventView> eventsOf(Long sessionId, Long participantId) {
        ExamParticipant p = participants.findById(participantId)
                .filter(x -> x.getSession().getId().equals(sessionId))
                .orElseThrow(() -> new NoSuchElementException("없는 대상자입니다."));
        return events.findByParticipantIdOrderByStartedAtAsc(p.getId()).stream().map(ProctorEventView::from).toList();
    }

    /** 콘솔에서 사진 보기. 보관 기간이 지나 지운 사진은 IllegalStateException */
    @Transactional(readOnly = true)
    public byte[] snapshot(Long sessionId, Long eventId) {
        ProctorEvent e = events.findById(eventId).orElseThrow(() -> new NoSuchElementException("없는 이벤트입니다."));
        ExamParticipant p = participants.findById(e.getParticipantId()).orElseThrow();
        if (!p.getSession().getId().equals(sessionId)) throw new NoSuchElementException("없는 이벤트입니다.");
        if (e.getSnapshotKey() == null) throw new NoSuchElementException("사진이 없는 이벤트입니다.");
        if (e.getSnapshotDeletedAt() != null) throw new IllegalStateException("보관 기간이 지나 삭제된 사진입니다.");
        return storage.get(e.getSnapshotKey()).orElseThrow(() -> new NoSuchElementException("사진 파일이 없습니다."));
    }

    /** 보관 기간이 지난 사진 파일을 지우고 기록만 남긴다. @return 지운 장수 */
    @Transactional
    public int purgeExpiredSnapshots() {
        Instant now = clock.instant();
        Instant before = now.minus(Duration.ofHours(props.snapshotRetentionHours()));
        int total = 0;
        List<ProctorEvent> batch;
        do {
            batch = events.findExpiredSnapshots(before, PageRequest.of(0, PURGE_BATCH));
            for (ProctorEvent e : batch) {
                storage.delete(e.getSnapshotKey());
                e.markSnapshotDeleted(now);
            }
            events.flush();
            total += batch.size();
        } while (batch.size() == PURGE_BATCH);
        return total;
    }

    private ExamParticipant findParticipant(String token) {
        if (!InviteTokens.looksValid(token)) throw new NoSuchElementException("입장 링크가 올바르지 않습니다.");
        return participants.findByInviteToken(token).orElseThrow(() -> new NoSuchElementException("입장 링크가 올바르지 않습니다."));
    }

    private String detail(ProctorEventRequest req) {
        if (req.detail() == null || req.detail().isNull()) return null;
        try {
            String s = json.writeValueAsString(req.detail());
            if (s.length() > MAX_DETAIL_CHARS) throw new IllegalArgumentException("이벤트 상세가 너무 깁니다.");
            return s;
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("이벤트 상세를 읽지 못했습니다.");
        }
    }
}
