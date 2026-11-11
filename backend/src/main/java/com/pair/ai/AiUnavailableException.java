package com.pair.ai;

/** API 키가 없거나 AI 호출이 실패했을 때. 화면에 그대로 보여 줄 수 있는 한국어 메시지를 담는다. */
public class AiUnavailableException extends RuntimeException {

    public AiUnavailableException(String message) {
        super(message);
    }
}
