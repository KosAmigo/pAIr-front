package com.pair.exam.service;

import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pair.exam.ExamProperties;
import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.repository.ExamParticipantRepository;
import com.pair.exam.repository.ExamSessionRepository;
import com.pair.exam.web.ExamDtos.AddParticipantsResult;
import com.pair.exam.web.ExamDtos.ParticipantInput;
import com.pair.exam.web.ExamDtos.ParticipantView;
import com.pair.exam.web.ExamDtos.Rejected;
import com.pair.exam.web.ExamDtos.SessionDetail;
import com.pair.exam.web.ExamDtos.SessionRequest;
import com.pair.exam.web.ExamDtos.SessionSummary;
import com.pair.task.TaskRepository;

/** 기업 콘솔: 회차 CRUD 와 대상자 등록. */
@Service
public class ExamSessionService {

    /** 엑셀은 Bean Validation 을 거치지 않으므로 같은 기준으로 한 번 더 본다 */
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]+$");
    private static final int MAX_NAME = 50;
    private static final int MAX_EMAIL = 255;

    private final ExamSessionRepository sessions;
    private final ExamParticipantRepository participants;
    private final TaskRepository tasks;
    private final ApplicationEventPublisher events;
    private final ExamProperties props;
    private final Clock clock;

    public ExamSessionService(ExamSessionRepository sessions, ExamParticipantRepository participants, TaskRepository tasks,
            ApplicationEventPublisher events, ExamProperties props, Clock clock) {
        this.sessions = sessions;
        this.participants = participants;
        this.tasks = tasks;
        this.events = events;
        this.props = props;
        this.clock = clock;
    }

    @Transactional
    public SessionSummary create(SessionRequest req) {
        Instant now = clock.instant();
        validateSchedule(req, now);
        req.taskIds().forEach(tasks::get); // 없는 과제면 404
        ExamSession s = sessions.save(new ExamSession(req.companyId(), req.title().trim(), req.startsAt(), req.endsAt(),
                req.proctoring(), req.taskIds(), now));
        return summary(s, null, now);
    }

    @Transactional(readOnly = true)
    public List<SessionSummary> list(Long companyId) {
        Instant now = clock.instant();
        List<ExamSession> list = sessions.findByCompanyIdOrderByStartsAtDesc(companyId);
        if (list.isEmpty()) return List.of();
        Map<Long, ExamParticipantRepository.SessionCounts> counts = participants
                .countBySessionIds(list.stream().map(ExamSession::getId).toList()).stream()
                .collect(Collectors.toMap(ExamParticipantRepository.SessionCounts::getSessionId, Function.identity()));
        return list.stream().map(s -> summary(s, counts.get(s.getId()), now)).toList();
    }

    @Transactional(readOnly = true)
    public SessionDetail detail(Long sessionId) {
        Instant now = clock.instant();
        ExamSession s = require(sessionId);
        List<ExamParticipant> ps = participants.findBySessionIdOrderByIdAsc(sessionId);
        long entered = ps.stream().filter(p -> p.getEnteredAt() != null).count();
        long submitted = ps.stream().filter(p -> p.getSubmittedAt() != null).count();
        SessionSummary sum = new SessionSummary(s.getId(), s.getTitle(), s.getStartsAt(), s.getEndsAt(), s.isProctoring(),
                s.phase(now), s.getTaskIds(), ps.size(), entered, submitted);
        return new SessionDetail(sum, now, s.getClosedAt(), ps.stream().map(ParticipantView::from).toList());
    }

    /** 시작 전에만 고칠 수 있다 (진행 중에 시각을 바꾸면 응시자마다 조건이 달라진다) */
    @Transactional
    public SessionSummary update(Long sessionId, SessionRequest req) {
        Instant now = clock.instant();
        ExamSession s = requireUpcoming(sessionId, now, "고칠");
        if (!s.getCompanyId().equals(req.companyId())) throw new IllegalArgumentException("다른 회사의 회차로 옮길 수 없습니다.");
        validateSchedule(req, now);
        req.taskIds().forEach(tasks::get);
        s.update(req.title().trim(), req.startsAt(), req.endsAt(), req.proctoring(), req.taskIds());
        return summary(s, null, now);
    }

    @Transactional
    public void delete(Long sessionId) {
        ExamSession s = requireUpcoming(sessionId, clock.instant(), "삭제할");
        sessions.delete(s);
    }

    /** 대상자 추가. 형식이 틀리거나 이미 있는 이메일은 건너뛰고 이유를 돌려준다. 초대 메일은 커밋 뒤에 보낸다 */
    @Transactional
    public AddParticipantsResult addParticipants(Long sessionId, List<ParticipantInput> inputs) {
        Instant now = clock.instant();
        ExamSession s = require(sessionId);
        if (s.phase(now) == ExamSession.Phase.ENDED) throw new IllegalStateException("끝난 회차에는 대상자를 추가할 수 없습니다.");
        if (inputs.size() > props.maxParticipantsPerUpload()) {
            throw new IllegalArgumentException("한 번에 " + props.maxParticipantsPerUpload() + "명까지 추가할 수 있습니다.");
        }

        List<Rejected> rejected = new ArrayList<>();
        List<ParticipantInput> valid = new ArrayList<>();
        List<Integer> lines = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < inputs.size(); i++) {
            ParticipantInput in = inputs.get(i);
            int line = i + 1;
            String name = in.name() == null ? "" : in.name().trim();
            String email = in.email() == null ? "" : in.email().trim().toLowerCase();
            String reason = validate(name, email);
            if (reason == null && !seen.add(email)) reason = "목록 안에서 이메일이 중복됩니다.";
            if (reason != null) {
                rejected.add(new Rejected(line, name, email, reason));
                continue;
            }
            valid.add(new ParticipantInput(name, email));
            lines.add(line);
        }

        Set<String> existing = valid.isEmpty() ? Set.of()
                : new HashSet<>(participants.findExistingEmails(sessionId, valid.stream().map(ParticipantInput::email).toList()));
        List<ExamParticipant> toSave = new ArrayList<>();
        for (int i = 0; i < valid.size(); i++) {
            ParticipantInput in = valid.get(i);
            if (existing.contains(in.email())) {
                rejected.add(new Rejected(lines.get(i), in.name(), in.email(), "이미 등록된 대상자입니다."));
                continue;
            }
            toSave.add(new ExamParticipant(s, in.email(), in.name(), InviteTokens.next(), now));
        }
        List<ExamParticipant> saved = participants.saveAll(toSave);
        if (!saved.isEmpty()) events.publishEvent(new InvitesCreated(saved.stream().map(ExamParticipant::getId).toList()));
        rejected.sort((a, b) -> Integer.compare(a.line(), b.line()));
        return new AddParticipantsResult(saved.size(), rejected);
    }

    /** 엑셀 업로드. 행 번호를 엑셀 기준으로 바꿔서 돌려준다 */
    @Transactional
    public AddParticipantsResult importExcel(Long sessionId, InputStream in) {
        List<ParticipantExcelParser.ExcelRow> rows = ParticipantExcelParser.parse(in, props.maxParticipantsPerUpload());
        if (rows.isEmpty()) throw new IllegalArgumentException("엑셀에 대상자가 없습니다.");
        AddParticipantsResult r = addParticipants(sessionId,
                rows.stream().map(row -> new ParticipantInput(row.name(), row.email())).toList());
        List<Rejected> mapped = r.rejected().stream()
                .map(x -> new Rejected(rows.get(x.line() - 1).line(), x.name(), x.email(), x.reason())).toList();
        return new AddParticipantsResult(r.added(), mapped);
    }

    /** 실패했거나 다시 보내고 싶은 초대 메일 */
    @Transactional
    public void resendInvite(Long sessionId, Long participantId) {
        ExamParticipant p = participants.findById(participantId)
                .filter(x -> x.getSession().getId().equals(sessionId))
                .orElseThrow(() -> new NoSuchElementException("없는 대상자입니다."));
        if (p.getSession().phase(clock.instant()) == ExamSession.Phase.ENDED) {
            throw new IllegalStateException("끝난 회차의 초대 메일은 보낼 수 없습니다.");
        }
        events.publishEvent(new InvitesCreated(List.of(p.getId())));
    }

    ExamSession require(Long sessionId) {
        return sessions.findById(sessionId).orElseThrow(() -> new NoSuchElementException("없는 회차입니다: " + sessionId));
    }

    private ExamSession requireUpcoming(Long sessionId, Instant now, String verb) {
        ExamSession s = require(sessionId);
        if (s.phase(now) != ExamSession.Phase.UPCOMING) throw new IllegalStateException("시작한 회차는 " + verb + " 수 없습니다.");
        return s;
    }

    private static void validateSchedule(SessionRequest req, Instant now) {
        if (!req.endsAt().isAfter(req.startsAt())) throw new IllegalArgumentException("종료 시각은 시작 시각보다 뒤여야 합니다.");
        if (!req.startsAt().isAfter(now)) throw new IllegalArgumentException("시작 시각은 지금보다 뒤여야 합니다.");
    }

    private static String validate(String name, String email) {
        if (name.isEmpty()) return "이름이 비어 있습니다.";
        if (name.length() > MAX_NAME) return "이름은 " + MAX_NAME + "자까지입니다.";
        if (email.isEmpty()) return "이메일이 비어 있습니다.";
        if (email.length() > MAX_EMAIL || !EMAIL.matcher(email).matches()) return "이메일 형식이 아닙니다.";
        return null;
    }

    private static SessionSummary summary(ExamSession s, ExamParticipantRepository.SessionCounts c, Instant now) {
        return new SessionSummary(s.getId(), s.getTitle(), s.getStartsAt(), s.getEndsAt(), s.isProctoring(), s.phase(now),
                s.getTaskIds(), c == null ? 0 : c.getTotal(), c == null ? 0 : c.getEntered(), c == null ? 0 : c.getSubmitted());
    }
}
