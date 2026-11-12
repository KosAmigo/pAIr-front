package com.pair.ai;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.pair.attempt.ChatTurn;
import com.pair.config.AiKeys;
import com.pair.config.PairProperties;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 배치 API (비용 절반, 결과는 몇 분~최대 24시간 뒤). 채점 툴의 배치 채점에서만 쓴다.
 * Spring AI 1.1 / 2.x 모두 배치 API 를 지원하지 않아(2026-11-12 확인: OpenAI PR #5875, Anthropic PR #6713 미반영)
 * Spring 의 RestClient 로 직접 부른다. 요청 내용은 일반 채점(Spring AI)이 보내는 것과 같게 만든다.
 * - Anthropic: POST /v1/messages/batches → GET /v1/messages/batches/{id} → results_url (JSONL)
 * - OpenAI: POST /v1/files (purpose=batch, JSONL) → POST /v1/batches → GET /v1/batches/{id} → GET /v1/files/{output_file_id}/content
 */
@Component
public class BatchClient {

    /** Spring AI 1.1 이 Anthropic 에 보내는 값과 같게 맞춘다 (AnthropicApi.DEFAULT_ANTHROPIC_VERSION, 구조화 출력 베타). */
    static final String ANTHROPIC_VERSION = "2023-06-01";
    static final String ANTHROPIC_BETA = "structured-outputs-2025-11-13";

    private final AiKeys keys;
    private final PairProperties props;
    private final ObjectMapper json;

    public BatchClient(AiKeys keys, PairProperties props, ObjectMapper json) {
        this.keys = keys;
        this.props = props;
        this.json = json;
    }

    public record Req(String customId, ObjectNode body) {}

    /** 배치 상태. done: 끝났는지(성공, 실패, 만료, 취소 모두). */
    public record Status(String raw, boolean done, String resultsUrl, String outputFileId, String errorFileId) {}

    // ── 요청 만들기 (일반 채점과 같은 내용) ─────────────

    /** Claude 채점 요청 (ClaudeJudge 와 같음: 시스템 프롬프트 캐시, 구조화 출력, effort). */
    public ObjectNode claudeJudgeParams(String system, String prefix, String user, String schemaJson) {
        PairProperties.Model cfg = props.judge().claude();
        ObjectNode p = json.createObjectNode();
        p.put("model", cfg.model());
        p.put("max_tokens", cfg.maxTokens());
        ArrayNode sys = p.putArray("system");
        ObjectNode block = sys.addObject();
        block.put("type", "text");
        block.put("text", prefix == null || prefix.isBlank() ? system : system + "\n\n" + prefix);
        block.putObject("cache_control").put("type", "ephemeral");
        ObjectNode msg = p.putArray("messages").addObject();
        msg.put("role", "user");
        ObjectNode content = msg.putArray("content").addObject();
        content.put("type", "text");
        content.put("text", user);
        ObjectNode oc = p.putObject("output_config");
        ObjectNode format = oc.putObject("format");
        format.put("type", "json_schema");
        format.set("schema", parse(schemaJson));
        if (cfg.effort() != null && !cfg.effort().isBlank()) oc.put("effort", cfg.effort().toLowerCase());
        return p;
    }

    /** OpenAI 채점 요청 (OpenAiJudge 와 같음: Chat Completions, 구조화 출력, reasoning_effort). */
    public ObjectNode openaiJudgeBody(String system, String prefix, String user, String schemaJson) {
        PairProperties.Model cfg = props.judge().openai();
        ObjectNode b = json.createObjectNode();
        b.put("model", cfg.model());
        ArrayNode msgs = b.putArray("messages");
        msgs.addObject().put("role", "system").put("content", prefix == null || prefix.isBlank() ? system : system + "\n\n" + prefix);
        msgs.addObject().put("role", "user").put("content", user);
        b.put("max_completion_tokens", cfg.maxTokens());
        if (cfg.effort() != null && !cfg.effort().isBlank()) b.put("reasoning_effort", cfg.effort());
        ObjectNode rf = b.putObject("response_format");
        rf.put("type", "json_schema");
        ObjectNode js = rf.putObject("json_schema");
        js.put("name", "custom_schema");
        js.set("schema", parse(schemaJson));
        js.put("strict", true);
        return b;
    }

    /** 어시스턴트 다시 실행 요청 (AssistantClient 와 같음). */
    public ObjectNode replayBody(ChatTurn.AssistantRequest req) {
        ObjectNode b = json.createObjectNode();
        b.put("model", req.model());
        ArrayNode msgs = b.putArray("messages");
        msgs.addObject().put("role", "system").put("content", req.systemPrompt());
        for (ChatTurn.Message m : req.messages()) {
            msgs.addObject().put("role", "user".equals(m.role()) ? "user" : "assistant").put("content", m.content());
        }
        b.put("max_completion_tokens", req.maxOutputTokens());
        if (req.reasoningEffort() != null && !req.reasoningEffort().isBlank()) b.put("reasoning_effort", req.reasoningEffort());
        return b;
    }

    // ── Anthropic ─────────────────────

    private RestClient anthropic() {
        if (!keys.hasAnthropic()) throw new AiUnavailableException("Anthropic API 키가 없어 배치를 보낼 수 없습니다.");
        return RestClient.builder().baseUrl("https://api.anthropic.com")
                .defaultHeader("x-api-key", keys.anthropic())
                .defaultHeader("anthropic-version", ANTHROPIC_VERSION)
                .defaultHeader("anthropic-beta", ANTHROPIC_BETA)
                .build();
    }

    public String anthropicCreate(List<Req> reqs) {
        ObjectNode body = json.createObjectNode();
        ArrayNode arr = body.putArray("requests");
        for (Req r : reqs) {
            ObjectNode o = arr.addObject();
            o.put("custom_id", r.customId());
            o.set("params", r.body());
        }
        JsonNode res = call("Anthropic 배치 생성", () -> anthropic().post().uri("/v1/messages/batches")
                .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class));
        return res.path("id").asText();
    }

    public Status anthropicStatus(String id) {
        JsonNode r = call("Anthropic 배치 조회", () -> anthropic().get().uri("/v1/messages/batches/{id}", id).retrieve().body(JsonNode.class));
        String s = r.path("processing_status").asText();
        String url = r.path("results_url").isTextual() ? r.path("results_url").asText() : null;
        return new Status(s + " " + r.path("request_counts"), "ended".equals(s), url, null, null);
    }

    /** custom_id → result ({type: succeeded|errored|canceled|expired, message, error}) */
    public Map<String, JsonNode> anthropicResults(String resultsUrl) {
        String text = call("Anthropic 배치 결과", () -> anthropic().get().uri(resultsUrl).retrieve().body(String.class));
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (String line : lines(text)) {
            JsonNode n = parse(line);
            out.put(n.path("custom_id").asText(), n.path("result"));
        }
        return out;
    }

    public void anthropicCancel(String id) {
        call("Anthropic 배치 취소", () -> anthropic().post().uri("/v1/messages/batches/{id}/cancel", id).retrieve().body(JsonNode.class));
    }

    // ── OpenAI ─────────────────────

    private RestClient openai() {
        if (!keys.hasOpenai()) throw new AiUnavailableException("OpenAI API 키가 없어 배치를 보낼 수 없습니다.");
        return RestClient.builder().baseUrl("https://api.openai.com")
                .defaultHeader("Authorization", "Bearer " + keys.openai())
                .build();
    }

    /** 한 배치에는 한 모델의 요청만 넣을 수 있다(OpenAI 규칙). 부르는 쪽이 모델별로 나눠서 부른다. */
    public String openaiCreate(List<Req> reqs) {
        StringBuilder sb = new StringBuilder();
        for (Req r : reqs) {
            ObjectNode line = json.createObjectNode();
            line.put("custom_id", r.customId());
            line.put("method", "POST");
            line.put("url", "/v1/chat/completions");
            line.set("body", r.body());
            sb.append(line).append("\n");
        }
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("purpose", "batch");
        form.add("file", new ByteArrayResource(sb.toString().getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return "pair-batch.jsonl";
            }
        });
        JsonNode file = call("OpenAI 배치 파일 업로드", () -> openai().post().uri("/v1/files")
                .contentType(MediaType.MULTIPART_FORM_DATA).body(form).retrieve().body(JsonNode.class));
        ObjectNode body = json.createObjectNode();
        body.put("input_file_id", file.path("id").asText());
        body.put("endpoint", "/v1/chat/completions");
        body.put("completion_window", "24h");
        JsonNode batch = call("OpenAI 배치 생성", () -> openai().post().uri("/v1/batches")
                .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class));
        return batch.path("id").asText();
    }

    public Status openaiStatus(String id) {
        JsonNode r = call("OpenAI 배치 조회", () -> openai().get().uri("/v1/batches/{id}", id).retrieve().body(JsonNode.class));
        String s = r.path("status").asText();
        boolean done = List.of("completed", "failed", "expired", "cancelled").contains(s);
        return new Status(s + " " + r.path("request_counts"), done, null,
                r.path("output_file_id").isTextual() ? r.path("output_file_id").asText() : null,
                r.path("error_file_id").isTextual() ? r.path("error_file_id").asText() : null);
    }

    /** custom_id → 줄 전체 ({response: {status_code, body}, error}) */
    public Map<String, JsonNode> openaiResults(Status st) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (String fileId : new String[] {st.outputFileId(), st.errorFileId()}) {
            if (fileId == null || fileId.isBlank()) continue;
            String text = call("OpenAI 배치 결과", () -> openai().get().uri("/v1/files/{id}/content", fileId).retrieve().body(String.class));
            for (String line : lines(text)) {
                JsonNode n = parse(line);
                out.put(n.path("custom_id").asText(), n);
            }
        }
        return out;
    }

    public void openaiCancel(String id) {
        call("OpenAI 배치 취소", () -> openai().post().uri("/v1/batches/{id}/cancel", id).retrieve().body(JsonNode.class));
    }

    // ── 결과 읽기 ─────────────────────

    /** 배치 결과 하나에서 꺼낸 답. ok=false 면 error 에 이유. */
    public record Answer(boolean ok, String text, long inputTokens, long outputTokens, long cachedInputTokens, String finishReason, String error) {}

    /** Anthropic 결과: 생각 블록 뒤에 오는 마지막 text 블록을 답으로 쓴다(일반 채점과 같음). */
    public static Answer fromAnthropic(JsonNode result) {
        if (result == null || !"succeeded".equals(result.path("type").asText())) {
            return new Answer(false, "", 0, 0, 0, "none", result == null ? "결과 없음" : result.path("type").asText() + " " + result.path("error"));
        }
        JsonNode msg = result.path("message");
        String text = "";
        for (JsonNode b : msg.path("content")) {
            if ("text".equals(b.path("type").asText()) && !b.path("text").asText().isBlank()) text = b.path("text").asText();
        }
        JsonNode u = msg.path("usage");
        long read = u.path("cache_read_input_tokens").asLong();
        long write = u.path("cache_creation_input_tokens").asLong();
        return new Answer(true, text, u.path("input_tokens").asLong() + read + write, u.path("output_tokens").asLong(), read,
                msg.path("stop_reason").asText("none"), null);
    }

    /** OpenAI 결과 줄: response.body 가 Chat Completions 응답과 같다. */
    public static Answer fromOpenai(JsonNode line) {
        if (line == null) return new Answer(false, "", 0, 0, 0, "none", "결과 없음");
        JsonNode resp = line.path("response");
        if (resp.path("status_code").asInt() != 200) {
            return new Answer(false, "", 0, 0, 0, "none", "status " + resp.path("status_code").asInt() + " " + line.path("error") + " " + resp.path("body").path("error"));
        }
        JsonNode body = resp.path("body");
        JsonNode choice = body.path("choices").path(0);
        JsonNode u = body.path("usage");
        return new Answer(true, choice.path("message").path("content").asText(""), u.path("prompt_tokens").asLong(),
                u.path("completion_tokens").asLong(), u.path("prompt_tokens_details").path("cached_tokens").asLong(),
                choice.path("finish_reason").asText("none"), null);
    }

    // ── 내부 ───────────────────────────

    private JsonNode parse(String s) {
        try {
            return json.readTree(s);
        } catch (Exception e) {
            throw new AiUnavailableException("JSON 을 읽지 못했습니다: " + e.getMessage());
        }
    }

    private static List<String> lines(String text) {
        if (text == null) return List.of();
        return text.lines().map(String::trim).filter(l -> !l.isEmpty()).toList();
    }

    private static <T> T call(String what, java.util.function.Supplier<T> f) {
        try {
            T v = f.get();
            if (v == null) throw new AiUnavailableException(what + ": 응답이 비어 있습니다.");
            return v;
        } catch (RestClientResponseException e) {
            String body = e.getResponseBodyAsString();
            throw new AiUnavailableException(what + " 실패 (" + e.getStatusCode().value() + "): " + (body.length() > 300 ? body.substring(0, 300) : body));
        }
    }
}
