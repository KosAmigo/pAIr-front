package com.pair.exam.service;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import com.pair.exam.ExamProperties;
import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.repository.ExamParticipantRepository;

/**
 * 초대 메일 비동기 발송.
 * 대상자 등록 트랜잭션이 커밋된 뒤(AFTER_COMMIT)에 별도 스레드(@Async)에서 보낸다.
 * 그래서 1000명을 올려도 업로드 응답은 바로 돌아오고, 메일 서버가 느리거나 죽어도 등록은 남는다.
 * 결과(SENT/FAILED)는 대상자마다 짧은 트랜잭션으로 저장한다. 실패한 메일은 콘솔에서 다시 보낼 수 있다.
 */
@Component
public class InviteMailer {
    private static final Logger log = LoggerFactory.getLogger(InviteMailer.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(KST);

    private final JavaMailSender mail;
    private final ExamParticipantRepository participants;
    private final TransactionTemplate tx;
    private final ExamProperties props;

    public InviteMailer(JavaMailSender mail, ExamParticipantRepository participants, TransactionTemplate tx,
            ExamProperties props) {
        this.mail = mail;
        this.participants = participants;
        this.tx = tx;
        this.props = props;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onInvitesCreated(InvitesCreated event) {
        for (Long id : event.participantIds()) sendOne(id);
    }

    void sendOne(Long participantId) {
        SimpleMailMessage msg = tx.execute(status -> participants.findById(participantId).map(this::message).orElse(null));
        if (msg == null) return; // 그 사이 회차가 삭제됨
        String error = null;
        try {
            mail.send(msg);
        } catch (MailException e) {
            error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            // 메일 주소는 개인정보라 로그에 남기지 않는다
            log.warn("초대 메일 발송 실패: participantId={} ({})", participantId, e.getClass().getSimpleName());
        }
        String err = error;
        tx.executeWithoutResult(status -> participants.findById(participantId).ifPresent(p -> {
            if (err == null) p.markInviteSent();
            else p.markInviteFailed(err);
        }));
    }

    SimpleMailMessage message(ExamParticipant p) {
        ExamSession s = p.getSession();
        SimpleMailMessage m = new SimpleMailMessage();
        m.setFrom(props.mailFrom());
        m.setTo(p.getEmail());
        m.setSubject("[pAIr] " + s.getTitle() + " 시험 안내");
        m.setText("""
                %s님, 안녕하세요.

                %s 시험에 초대되었습니다.
                시험 시간: %s ~ %s (한국 시간)

                아래 링크로 입장하세요. 링크는 본인에게만 발급되었으니 다른 사람과 공유하지 마세요.
                %s

                시작 시각 10분 전까지 입장해 카메라 점검을 마쳐 주세요.
                """.formatted(p.getName(), s.getTitle(), WHEN.format(s.getStartsAt()), WHEN.format(s.getEndsAt()),
                entryUrl(p.getInviteToken())));
        return m;
    }

    String entryUrl(String token) {
        String base = props.entryBaseUrl().endsWith("/") ? props.entryBaseUrl().substring(0, props.entryBaseUrl().length() - 1)
                : props.entryBaseUrl();
        // 프론트 라우트는 /entry (App.tsx). 토큰은 쿼리로 넘긴다
        return base + "/entry?invite=" + token;
    }
}
