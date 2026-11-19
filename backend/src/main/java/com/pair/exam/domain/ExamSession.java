package com.pair.exam.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

/** 실전 시험 회차. 시작·종료 시각은 서버 시각 기준이다. */
@Entity
@Table(name = "exam_sessions")
public class ExamSession {

    public enum Phase { UPCOMING, LIVE, ENDED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_id")
    private Long id;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Column(nullable = false)
    private boolean proctoring;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    /** 과제 순서 = 리스트 순서 (exam_session_tasks.sort_order) */
    @ElementCollection
    @CollectionTable(name = "exam_session_tasks", joinColumns = @JoinColumn(name = "session_id"))
    @OrderColumn(name = "sort_order")
    @Column(name = "task_id", length = 64, nullable = false)
    private List<String> taskIds = new ArrayList<>();

    protected ExamSession() {}

    public ExamSession(Long companyId, String title, Instant startsAt, Instant endsAt, boolean proctoring,
            List<String> taskIds, Instant createdAt) {
        this.companyId = companyId;
        this.createdAt = createdAt;
        update(title, startsAt, endsAt, proctoring, taskIds);
    }

    public void update(String title, Instant startsAt, Instant endsAt, boolean proctoring, List<String> taskIds) {
        if (!endsAt.isAfter(startsAt)) throw new IllegalArgumentException("종료 시각은 시작 시각보다 뒤여야 합니다.");
        if (taskIds == null || taskIds.isEmpty()) throw new IllegalArgumentException("과제를 하나 이상 골라 주세요.");
        if (taskIds.stream().distinct().count() != taskIds.size()) throw new IllegalArgumentException("같은 과제를 두 번 넣을 수 없습니다.");
        this.title = title;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.proctoring = proctoring;
        this.taskIds.clear();
        this.taskIds.addAll(taskIds);
    }

    public Phase phase(Instant now) {
        if (now.isBefore(startsAt)) return Phase.UPCOMING;
        if (now.isBefore(endsAt)) return Phase.LIVE;
        return Phase.ENDED;
    }

    public void close(Instant at) {
        this.closedAt = at;
    }

    public Long getId() { return id; }
    public Long getCompanyId() { return companyId; }
    public String getTitle() { return title; }
    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public boolean isProctoring() { return proctoring; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getClosedAt() { return closedAt; }
    public List<String> getTaskIds() { return List.copyOf(taskIds); }
}
