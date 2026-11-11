package com.pair.attempt;

import java.time.Instant;
import java.util.List;

/**
 * 대화 턴 하나. 응시자 메시지와 AI 응답이 각각 한 턴이다(#T01 응시자, #T02 AI ...).
 * AI 턴에는 R2 다시 실행에 필요한 요청 원문(request)을 그대로 남긴다.
 */
public record ChatTurn(
        int turn,
        String role,            // user | ai
        Instant at,
        String text,
        String provider,
        String model,
        AssistantRequest request,
        Long inputTokens,
        Long outputTokens,
        Long latencyMs) {

    /** 어시스턴트에 보낸 요청 원문. reasoningEffort 는 2026-11-11 이후 요청에만 있다(이전 요청은 null = 모델 기본값). */
    public record AssistantRequest(String model, long maxOutputTokens, String reasoningEffort, String systemPrompt, List<Message> messages) {}

    public record Message(String role, String content) {}
}
