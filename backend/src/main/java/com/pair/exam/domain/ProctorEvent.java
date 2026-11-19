package com.pair.exam.domain;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 감독 이벤트 1건. 카메라 이벤트는 사진 1장(snapshotKey)이 붙을 수 있다. */
@Entity
@Table(name = "proctor_events")
public class ProctorEvent {

    /** 브라우저 이벤트(frontend/anti-cheating)와 카메라 이벤트(cam-proctor)를 함께 받는다 */
    public enum Type {
        TAB_HIDDEN, WINDOW_BLUR, MOUSE_LEAVE, PASTE, FULLSCREEN_EXIT,
        NO_FACE, MULTI_FACE, HEAD_TURN, HEAD_DOWN, GAZE_AWAY, TORSO_SHIFT, TORSO_TURN,
        HAND_MISSING, HAND_MOVED, ARM_MOVE, PHONE, EXTRA_SCREEN, BOOK, PHONE_DISCONNECTED
    }

    public enum Source { BROWSER, PC_CAM, PHONE_CAM }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "proctor_event_id")
    private Long id;

    @Column(name = "participant_id", nullable = false)
    private Long participantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Source source;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "duration_ms", nullable = false)
    private int durationMs;

    @Column(precision = 4, scale = 3)
    private BigDecimal confidence;

    @Column(columnDefinition = "text")
    private String detail;

    @Column(name = "snapshot_key", length = 255)
    private String snapshotKey;

    @Column(name = "snapshot_bytes", nullable = false)
    private int snapshotBytes;

    @Column(name = "snapshot_deleted_at")
    private Instant snapshotDeletedAt;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    protected ProctorEvent() {}

    public ProctorEvent(Long participantId, Type type, Source source, Instant startedAt, int durationMs,
            BigDecimal confidence, String detail, Instant receivedAt) {
        this.participantId = participantId;
        this.type = type;
        this.source = source;
        this.startedAt = startedAt;
        this.durationMs = durationMs;
        this.confidence = confidence;
        this.detail = detail;
        this.receivedAt = receivedAt;
    }

    public void attachSnapshot(String key, int bytes) {
        this.snapshotKey = key;
        this.snapshotBytes = bytes;
    }

    public void markSnapshotDeleted(Instant at) {
        this.snapshotDeletedAt = at;
    }

    public Long getId() { return id; }
    public Long getParticipantId() { return participantId; }
    public Type getType() { return type; }
    public Source getSource() { return source; }
    public Instant getStartedAt() { return startedAt; }
    public int getDurationMs() { return durationMs; }
    public BigDecimal getConfidence() { return confidence; }
    public String getDetail() { return detail; }
    public String getSnapshotKey() { return snapshotKey; }
    public int getSnapshotBytes() { return snapshotBytes; }
    public Instant getSnapshotDeletedAt() { return snapshotDeletedAt; }
    public Instant getReceivedAt() { return receivedAt; }
}
