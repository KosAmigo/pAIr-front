package com.pair.ai;

import java.io.IOException;

import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Spring AI 1.1 Anthropic 요청에 추론 강도(output_config.effort)를 넣는다.
 * Spring AI 1.1 에는 effort 옵션이 없고, 2.x 는 Spring Boot 4 가 필요해서 Boot 3.5 에서는 이 방법으로 채운다.
 * 함께, Spring AI 1.1 이 보내는 예전 이름의 구조화 출력(output_format)을 현재 이름(output_config.format)으로 옮긴다.
 */
final class AnthropicEffortInterceptor implements ClientHttpRequestInterceptor {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final String effort;

    AnthropicEffortInterceptor(String effort) {
        this.effort = effort;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
        if (!request.getURI().getPath().endsWith("/v1/messages") || body.length == 0) return execution.execute(request, body);
        JsonNode root = JSON.readTree(body);
        if (!(root instanceof ObjectNode obj)) return execution.execute(request, body);
        ObjectNode outputConfig = obj.has("output_config") && obj.get("output_config").isObject()
                ? (ObjectNode) obj.get("output_config") : obj.putObject("output_config");
        JsonNode format = obj.remove("output_format");
        if (format != null && !format.isNull()) outputConfig.set("format", format);
        if (effort != null && !effort.isBlank()) outputConfig.put("effort", effort.toLowerCase());
        if (outputConfig.isEmpty()) obj.remove("output_config");
        byte[] next = JSON.writeValueAsBytes(obj);
        request.getHeaders().setContentLength(next.length);
        return execution.execute(request, next);
    }
}
