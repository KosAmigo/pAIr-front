package com.pair.web;

import java.util.Map;
import java.util.NoSuchElementException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.pair.ai.AiUnavailableException;

/** 오류를 {"message": "..."} 형태로 돌려준다. 프론트는 이 메시지를 그대로 보여 준다. */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    ResponseEntity<Map<String, String>> noResource(Exception e) {
        return body(HttpStatus.NOT_FOUND, "없는 경로입니다. 화면은 http://localhost:5173 에서 여세요.");
    }

    @ExceptionHandler(NoSuchElementException.class)
    ResponseEntity<Map<String, String>> notFound(NoSuchElementException e) {
        return body(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    ResponseEntity<Map<String, String>> bad(RuntimeException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(AiUnavailableException.class)
    ResponseEntity<Map<String, String>> ai(AiUnavailableException e) {
        log.warn("AI 호출 실패: {}", e.getMessage());
        return body(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> other(Exception e) {
        log.error("처리하지 못한 오류", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류: " + e.getMessage());
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message == null ? status.getReasonPhrase() : message));
    }
}
