package com.giftgenius.ai.provider;

import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.giftgenius.config.AppProperties;

import tools.jackson.databind.JsonNode;

/**
 * Google Gemini via the Generative Language REST API, asking for JSON output. The API key comes only from the backend
 * environment (GEMINI_API_KEY), is sent only in the x-goog-api-key header, and never appears in logs, errors or
 * responses. Every call goes through the {@link AiBudget}.
 */
final class GeminiProvider implements AiProvider {

    private final RestClient http;
    private final AppProperties.Ai props;
    private final AiBudget budget;

    GeminiProvider(RestClient http, AppProperties.Ai props, AiBudget budget) {
        this.http = http;
        this.props = props;
        this.budget = budget;
    }

    @Override
    public boolean isAvailable() {
        return budget.hasRoom();
    }

    @Override
    public String generateJson(String systemPrompt, String userPrompt) {
        if (!budget.tryAcquire()) {
            throw new AiException("AI call budget reached, answering from rules");
        }
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
        } catch (HttpClientErrorException.TooManyRequests e) {
            budget.pause();
            throw new AiException("Gemini quota exhausted, pausing AI calls", e);
        } catch (RestClientResponseException e) {
            // Status only: response bodies are not repeated in logs.
            throw new AiException("Gemini request failed with HTTP " + e.getStatusCode().value(), e);
        } catch (RestClientException e) {
            throw new AiException("Gemini request failed: " + e.getMostSpecificCause().getClass().getSimpleName(), e);
        }
        if (res == null) {
            throw new AiException("Empty Gemini response");
        }
        JsonNode candidate = res.path("candidates").path(0);
        String finish = candidate.path("finishReason").asString("");
        if (!finish.isEmpty() && !"STOP".equals(finish) && !"MAX_TOKENS".equals(finish)) {
            throw new AiException("Gemini stopped with " + finish);
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode part : candidate.path("content").path("parts")) {
            if (!part.path("thought").asBoolean(false)) {
                text.append(part.path("text").asString(""));
            }
        }
        if (text.isEmpty()) {
            throw new AiException("Gemini returned no text");
        }
        return text.toString();
    }
}
