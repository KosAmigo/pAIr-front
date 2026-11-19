package com.pair.exam.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.domain.ProctorEvent;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 회차 API 요청·응답 DTO 모음. */
public final class ExamDtos {
    private ExamDtos() {}

    // ── 콘솔: 회차 ──

    public record SessionRequest(
            @NotNull Long companyId,
            @NotBlank @Size(max = 100) String title,
            @NotNull Instant startsAt,
            @NotNull Instant endsAt,
            boolean proctoring,
            @NotEmpty @Size(max = 10) List<@NotBlank @Size(max = 64) String> taskIds) {}

    public record SessionSummary(Long id, String title, Instant startsAt, Instant endsAt, boolean proctoring,
            ExamSession.Phase phase, List<String> taskIds, long participants, long entered, long submitted) {}

    public record ParticipantView(Long id, String name, String email, ExamParticipant.InviteStatus inviteStatus,
            String inviteError, Instant invitedAt, Instant enteredAt, Instant startedAt, Instant submittedAt,
            ExamParticipant.SubmitKind submitKind, Map<String, String> attempts) {

        public static ParticipantView from(ExamParticipant p) {
            return new ParticipantView(p.getId(), p.getName(), p.getEmail(), p.getInviteStatus(), p.getInviteError(),
                    p.getInvitedAt(), p.getEnteredAt(), p.getStartedAt(), p.getSubmittedAt(), p.getSubmitKind(),
                    p.getAttempts());
        }
    }

    public record SessionDetail(SessionSummary session, Instant serverNow, Instant closedAt,
            List<ParticipantView> participants) {}

    // ── 콘솔: 대상자 ──

    /** 행 단위 검증(형식·길이·중복)은 서비스가 한다. 잘못된 행 하나 때문에 전체를 거절하지 않고 이유와 함께 돌려준다 */
    public record ParticipantInput(String name, String email) {}

    public record AddParticipantsRequest(@NotEmpty @Size(max = 1000) List<@NotNull ParticipantInput> participants) {}

    /** line: 엑셀 행 번호(헤더 = 1) 또는 요청 목록 순서(1부터) */
    public record Rejected(int line, String name, String email, String reason) {}

    public record AddParticipantsResult(int added, List<Rejected> rejected) {}

    // ── 응시자: 입장 ──

    /** companyName: 기업 테이블이 아직 없어 null (명세상 선택 필드) */
    public record EntryInfo(String sessionTitle, String companyName, String name, String email, Instant startsAt, Instant endsAt, Instant serverNow,
            ExamSession.Phase phase, boolean proctoring, boolean consented, Instant startedAt, Instant submittedAt,
            List<String> taskIds, Map<String, String> attempts) {}

    public record ConsentRequest(@NotBlank @Size(max = 20) String consentVersion, @NotNull JsonNode envCheck) {}

    // ── 응시자: 감독 이벤트 ──

    public record ProctorEventRequest(
            @NotNull ProctorEvent.Type type,
            @NotNull ProctorEvent.Source source,
            @NotNull Instant startedAt,
            @Min(0) @Max(3_600_000) int durationMs,
            @DecimalMin("0") @DecimalMax("1") BigDecimal confidence,
            JsonNode detail,
            /** data:image/jpeg;base64,... 또는 base64 본문. 카메라 이벤트만 */
            String snapshot) {}

    public record ProctorEventView(Long id, ProctorEvent.Type type, ProctorEvent.Source source, Instant startedAt,
            int durationMs, BigDecimal confidence, String detail, String snapshot, int snapshotBytes) {

        public static ProctorEventView from(ProctorEvent e) {
            String snap = e.getSnapshotKey() == null ? null : e.getSnapshotDeletedAt() != null ? "deleted" : "ok";
            return new ProctorEventView(e.getId(), e.getType(), e.getSource(), e.getStartedAt(), e.getDurationMs(),
                    e.getConfidence(), e.getDetail(), snap, e.getSnapshotBytes());
        }
    }

    public record ServerTime(Instant serverNow) {}
}
