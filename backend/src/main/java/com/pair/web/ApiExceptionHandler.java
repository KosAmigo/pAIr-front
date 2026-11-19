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

    /** @Valid 요청 검증 실패, 잘못된 JSON·enum 값, 필수 파라미터 누락 */
    @ExceptionHandler({org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.web.method.annotation.HandlerMethodValidationException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.web.multipart.support.MissingServletRequestPartException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String, String>> invalid(Exception e) {
        if (e instanceof org.springframework.web.bind.MethodArgumentNotValidException m && m.getBindingResult().getFieldError() != null) {
            var f = m.getBindingResult().getFieldError();
            return body(HttpStatus.BAD_REQUEST, "입력값이 올바르지 않습니다: " + f.getField() + " (" + f.getDefaultMessage() + ")");
        }
        return body(HttpStatus.BAD_REQUEST, "요청 형식이 올바르지 않습니다.");
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> tooLarge(Exception e) {
        return body(HttpStatus.PAYLOAD_TOO_LARGE, "파일이 너무 큽니다 (최대 2MB).");
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
