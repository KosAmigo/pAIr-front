package com.pair.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class AnthropicEffortInterceptorTest {

    @Test
    void addsEffortAndMovesOutputFormat() throws Exception {
        var req = new MockClientHttpRequest(HttpMethod.POST, URI.create("https://api.anthropic.com/v1/messages"));
        String body = "{\"model\":\"claude-haiku-5-5\",\"max_tokens\":100,\"output_format\":{\"type\":\"json_schema\",\"schema\":{}}}";
        AtomicReference<byte[]> sent = new AtomicReference<>();
        new AnthropicEffortInterceptor("medium").intercept(req, body.getBytes(StandardCharsets.UTF_8), (r, b) -> {
            sent.set(b);
            return new MockClientHttpResponse(new byte[0], HttpStatus.OK);
        });
        JsonNode out = new ObjectMapper().readTree(sent.get());
        assertEquals("medium", out.path("output_config").path("effort").asText());
        assertEquals("json_schema", out.path("output_config").path("format").path("type").asText());
        assertFalse(out.has("output_format"));
        assertEquals(sent.get().length, req.getHeaders().getContentLength());
    }

    @Test
    void leavesOtherPathsAlone() throws Exception {
        var req = new MockClientHttpRequest(HttpMethod.POST, URI.create("https://api.anthropic.com/v1/models"));
        byte[] body = "{\"a\":1}".getBytes(StandardCharsets.UTF_8);
        AtomicReference<byte[]> sent = new AtomicReference<>();
        new AnthropicEffortInterceptor("low").intercept(req, body, (r, b) -> {
            sent.set(b);
            return new MockClientHttpResponse(new byte[0], HttpStatus.OK);
        });
        assertTrue(new String(sent.get(), StandardCharsets.UTF_8).equals("{\"a\":1}"));
    }
}
