package com.giftgenius.ai;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import tools.jackson.databind.JsonNode;
import com.giftgenius.config.AppProperties;

/** Google Gemini via the Generative Language REST API, asking for JSON output. */
@Component
public class GeminiClient implements LlmClient {

    private final RestClient http;
    private final AppProperties.Ai props;

    public GeminiClient(@Qualifier("geminiRestClient") RestClient http, AppProperties properties) {
        this.http = http;
        this.props = properties.ai();
    }

    @Override
    public boolean isAvailable() {
        return props.enabled() && StringUtils.hasText(props.apiKey());
    }

    @Override
    public String generateJson(String systemPrompt, String userPrompt) {
        Map<String, Object> body = Map.of(
                "systemInstruction", Map.of("parts", List.of(Map.of("text", systemPrompt))),
                "contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", userPrompt)))),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json",
                        "temperature", 0.7,
                        "maxOutputTokens", 2048));
        JsonNode res;
        try {
            res = http.post()
                    .uri("/v1beta/models/{model}:generateContent", props.model())
                    .header("x-goog-api-key", props.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException e) {
            throw new LlmException("Gemini request failed: " + e.getMessage(), e);
        }
        if (res == null) {
            throw new LlmException("Empty Gemini response");
        }
        JsonNode candidate = res.path("candidates").path(0);
        String finish = candidate.path("finishReason").asString("");
        if (!finish.isEmpty() && !"STOP".equals(finish) && !"MAX_TOKENS".equals(finish)) {
            throw new LlmException("Gemini stopped with " + finish);
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode part : candidate.path("content").path("parts")) {
            if (!part.path("thought").asBoolean(false)) {
                text.append(part.path("text").asString(""));
            }
        }
        if (text.isEmpty()) {
            throw new LlmException("Gemini returned no text");
        }
        return text.toString();
    }
}
