package com.pair.exam.service;

import java.time.Clock;
import java.time.Instant;
import java.util.NoSuchElementException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pair.exam.domain.ExamParticipant;
import com.pair.exam.domain.ExamSession;
import com.pair.exam.domain.ProctorConsent;
import com.pair.exam.repository.ExamParticipantRepository;
import com.pair.exam.repository.ProctorConsentRepository;
import com.pair.exam.web.ExamDtos.ConsentRequest;
import com.pair.exam.web.ExamDtos.EntryInfo;

/**
 * 응시자 입장 흐름: 링크(초대 토큰) → 시험 정보 → 동의·환경 점검 → 대기실 → 시작 → 제출.
 * 시작 가능 여부는 서버 시각으로만 판단한다. 응시자 PC 시계가 틀려도 모두 같은 순간에 시작한다.
 */
@Service
public class ExamEntryService {

    private static final int MAX_ENV_CHECK_CHARS = 20_000;

    private final ExamParticipantRepository participants;
    private final ProctorConsentRepository consents;
    private final AttemptSubmitter attempts;
    private final ObjectMapper json;
    private final Clock clock;

    public ExamEntryService(ExamParticipantRepository participants, ProctorConsentRepository consents,
            AttemptSubmitter attempts, ObjectMapper json, Clock clock) {
        this.participants = participants;
        this.consents = consents;
        this.attempts = attempts;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public EntryInfo info(String token) {
        return view(find(token), clock.instant());
    }

    @Transactional
    public EntryInfo consent(String token, ConsentRequest req) {
        Instant now = clock.instant();
        ExamParticipant p = find(token);
        requireNotEnded(p.getSession(), now);
        String env;
        try {
            env = json.writeValueAsString(req.envCheck());
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("환경 점검 결과를 읽지 못했습니다.");
        }
        if (env.length() > MAX_ENV_CHECK_CHARS) throw new IllegalArgumentException("환경 점검 결과가 너무 깁니다.");
        // 다시 점검하면 최신 결과로 바꾼다
        consents.save(new ProctorConsent(p.getId(), req.consentVersion(), env, now));
        return view(p, now);
    }

    /** 대기실 입장. 시작 전에 들어와 기다릴 수 있다 */
    @Transactional
    public EntryInfo enter(String token) {
        Instant now = clock.instant();
        ExamParticipant p = find(token);
        requireNotEnded(p.getSession(), now);
        p.markEntered(now);
        return view(p, now);
    }

    /** 시험 시작. 과제마다 응시를 만든다. 두 번 눌러도 응시는 한 번만 만든다 (행 잠금) */
    @Transactional
    public EntryInfo start(String token) {
        Instant now = clock.instant();
        ExamParticipant p = lock(token);
        ExamSession s = p.getSession();
        switch (s.phase(now)) {
            case UPCOMING -> throw new IllegalStateException("아직 시작 시각이 아닙니다.");
            case ENDED -> throw new IllegalStateException("이미 끝난 시험입니다.");
            case LIVE -> { }
        }
        if (p.getSubmittedAt() != null) throw new IllegalStateException("이미 제출했습니다.");
        if (s.isProctoring() && !consents.existsById(p.getId())) {
            throw new IllegalStateException("감독 동의와 환경 점검을 먼저 마쳐 주세요.");
        }
        p.markEntered(now);
        for (String taskId : s.getTaskIds()) {
            if (!p.getAttempts().containsKey(taskId)) p.linkAttempt(taskId, attempts.start(taskId));
        }
        p.markStarted(now);
        return view(p, now);
    }

    /** 응시자가 직접 제출. 종료 시각이 지나면 스케줄러가 대신 제출하므로 여기서는 막는다 */
    @Transactional
    public EntryInfo submit(String token) {
        Instant now = clock.instant();
        ExamParticipant p = lock(token);
        if (p.getStartedAt() == null) throw new IllegalStateException("시작하지 않은 시험입니다.");
        if (p.getSubmittedAt() != null) return view(p, now);
        if (p.getSession().phase(now) == ExamSession.Phase.ENDED) {
            throw new IllegalStateException("종료 시각이 지나 자동 제출을 기다리는 중입니다.");
        }
        attempts.submitAll(p.getAttempts());
        p.markSubmitted(now, ExamParticipant.SubmitKind.MANUAL);
        return view(p, now);
    }

    ExamParticipant find(String token) {
        if (!InviteTokens.looksValid(token)) throw new NoSuchElementException("입장 링크가 올바르지 않습니다.");
        return participants.findByInviteToken(token).orElseThrow(() -> new NoSuchElementException("입장 링크가 올바르지 않습니다."));
    }

    private ExamParticipant lock(String token) {
        if (!InviteTokens.looksValid(token)) throw new NoSuchElementException("입장 링크가 올바르지 않습니다.");
        return participants.lockByInviteToken(token).orElseThrow(() -> new NoSuchElementException("입장 링크가 올바르지 않습니다."));
    }

    private static void requireNotEnded(ExamSession s, Instant now) {
        if (s.phase(now) == ExamSession.Phase.ENDED) throw new IllegalStateException("이미 끝난 시험입니다.");
    }

    private EntryInfo view(ExamParticipant p, Instant now) {
        ExamSession s = p.getSession();
        return new EntryInfo(s.getTitle(), null, p.getName(), p.getEmail(), s.getStartsAt(), s.getEndsAt(), now, s.phase(now), s.isProctoring(),
                consents.existsById(p.getId()), p.getStartedAt(), p.getSubmittedAt(), s.getTaskIds(), p.getAttempts());
    }
}
