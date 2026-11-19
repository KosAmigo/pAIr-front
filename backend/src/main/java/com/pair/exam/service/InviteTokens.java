package com.pair.exam.service;

import java.security.SecureRandom;
import java.util.Base64;

/** 입장 링크용 초대 토큰. 추측할 수 없도록 32바이트 난수를 URL 안전한 base64 로 (43자). */
public final class InviteTokens {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private InviteTokens() {}

    public static String next() {
        byte[] b = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    /** 형식이 아예 다른 값은 DB 를 조회하기 전에 거른다 */
    public static boolean looksValid(String token) {
        return token != null && token.matches("[A-Za-z0-9_-]{43}");
    }
}
