package com.pair.ai;

/**
 * 채점 모델. 이중 채점을 위해 Claude 와 OpenAI 두 구현이 있다.
 * 프롬프트는 바뀌지 않는 앞부분(cachedPrefix: 과제, 정답, 체크 항목)과 응시마다 다른 뒷부분(user)으로 나눠
 * 앞부분을 프롬프트 캐시로 재사용한다.
 */
public interface Judge {

    /** cachedInputTokens: 입력 중 캐시에서 읽은 토큰(inputTokens 에 포함, 할인 가격). */
    record Result<T>(T value, long inputTokens, long outputTokens, long cachedInputTokens) {}

    /** "claude" 또는 "openai" */
    String name();

    String model();

    <T> Result<T> judge(String system, String cachedPrefix, String user, Class<T> type);
}
