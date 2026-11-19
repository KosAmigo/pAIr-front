package com.pair.exam.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 감독 동의와 환경 점검 결과. 대상자당 1건. */
@Entity
@Table(name = "proctor_consents")
public class ProctorConsent {

    @Id
    @Column(name = "participant_id")
    private Long participantId;

    @Column(name = "consent_version", nullable = false, length = 20)
    private String consentVersion;

    /** 환경 점검 결과 JSON (cam-proctor 의 checks 와 같은 모양) */
    @Column(name = "env_check", nullable = false, columnDefinition = "text")
    private String envCheck;

    @Column(name = "consented_at", nullable = false)
    private Instant consentedAt;

    protected ProctorConsent() {}

    public ProctorConsent(Long participantId, String consentVersion, String envCheck, Instant consentedAt) {
        this.participantId = participantId;
        this.consentVersion = consentVersion;
        this.envCheck = envCheck;
        this.consentedAt = consentedAt;
    }

    public Long getParticipantId() { return participantId; }
    public String getConsentVersion() { return consentVersion; }
    public String getEnvCheck() { return envCheck; }
    public Instant getConsentedAt() { return consentedAt; }
}
