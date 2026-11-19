package com.pair.exam;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 실전 시험 회차 설정 (application.yml 의 pair.exam). */
@ConfigurationProperties(prefix = "pair.exam")
public record ExamProperties(
        String entryBaseUrl,
        String mailFrom,
        long autoSubmitIntervalMs,
        long snapshotRetentionHours,
        int snapshotMaxBytes,
        int maxParticipantsPerUpload) {

    public ExamProperties {
        if (entryBaseUrl == null || entryBaseUrl.isBlank()) entryBaseUrl = "http://localhost:5173";
        if (mailFrom == null || mailFrom.isBlank()) mailFrom = "no-reply@pair.test";
        if (autoSubmitIntervalMs <= 0) autoSubmitIntervalMs = 2000;
        if (snapshotRetentionHours <= 0) snapshotRetentionHours = 168;
        if (snapshotMaxBytes <= 0) snapshotMaxBytes = 200_000;
        if (maxParticipantsPerUpload <= 0) maxParticipantsPerUpload = 1000;
    }

    public static ExamProperties defaults() {
        return new ExamProperties(null, null, 0, 0, 0, 0);
    }
}
