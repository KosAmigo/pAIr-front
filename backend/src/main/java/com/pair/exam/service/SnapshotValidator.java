package com.pair.exam.service;

import java.util.Base64;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.pair.exam.ExamProperties;

/** 응시자가 보낸 사진 검증. 저장소(파일 서버/로컬)와 상관없이 서버에서 먼저 거른다. */
@Component
public class SnapshotValidator {
    private static final String DATA_URL_PREFIX = "data:image/jpeg;base64,";

    private final int maxBytes;

    @Autowired
    public SnapshotValidator(ExamProperties props) {
        this(props.snapshotMaxBytes());
    }

    SnapshotValidator(int maxBytes) {
        this.maxBytes = maxBytes;
    }

    /** data URL 또는 base64 본문 → JPEG 바이트. JPEG 가 아니거나 너무 크면 거절 */
    public byte[] decode(String snapshot) {
        String b64 = snapshot.startsWith(DATA_URL_PREFIX) ? snapshot.substring(DATA_URL_PREFIX.length()) : snapshot;
        // base64 는 원본보다 4/3 배 길다. 디코딩 전에 길이로 먼저 거른다
        if (b64.length() > (long) maxBytes * 4 / 3 + 4) throw new IllegalArgumentException("사진이 너무 큽니다.");
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("사진 형식이 올바르지 않습니다.");
        }
        if (bytes.length > maxBytes) throw new IllegalArgumentException("사진이 너무 큽니다.");
        boolean jpeg = bytes.length > 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF;
        if (!jpeg) throw new IllegalArgumentException("JPEG 사진만 받습니다.");
        return bytes;
    }
}
