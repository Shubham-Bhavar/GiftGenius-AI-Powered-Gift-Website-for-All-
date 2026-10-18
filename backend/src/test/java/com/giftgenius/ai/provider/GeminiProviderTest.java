package com.giftgenius.ai.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.giftgenius.ai.provider.AiProvider.AiException;
import com.giftgenius.config.AppProperties;

class GeminiProviderTest {

    /** A made-up key: the point is to check where it goes, and where it never goes. */
    private static final String KEY = "test-key-not-real";
    private static final String URL = "https://gemini.test/v1beta/models/gemini-test:generateContent";

    private final RestClient.Builder builder = RestClient.builder().baseUrl("https://gemini.test");
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final AiBudgetTest.TestClock clock = new AiBudgetTest.TestClock("2026-10-07T10:00:00Z");

    private GeminiProvider provider(int dailyLimit) {
        AppProperties.Ai props = new AppProperties.Ai(true, KEY, "gemini-test", "https://gemini.test",
                Duration.ofSeconds(5), dailyLimit, Duration.ofMinutes(5));
        return new GeminiProvider(builder.build(), props, new AiBudget(dailyLimit, Duration.ofMinutes(5), clock));
    }

    private static String answer(String finishReason, String partsJson) {
        return "{\"candidates\":[{\"finishReason\":\"" + finishReason + "\",\"content\":{\"parts\":" + partsJson + "}}]}";
    }

    @Test
    void sendsBothPromptsForJsonWithTheKeyInAHeaderAndReturnsTheText() {
        server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST))
                .andExpect(header("x-goog-api-key", KEY))
                .andExpect(jsonPath("$.systemInstruction.parts[0].text").value("system rules"))
                .andExpect(jsonPath("$.contents[0].parts[0].text").value("user prompt"))
                .andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
                .andRespond(withSuccess(answer("STOP",
                        "[{\"thought\":true,\"text\":\"thinking\"},{\"text\":\"{\\\"ok\\\":\"},{\"text\":\"true}\"}]"),
                        MediaType.APPLICATION_JSON));

        assertThat(provider(10).generateJson("system rules", "user prompt")).isEqualTo("{\"ok\":true}");
        server.verify();
    }

    @Test
    void aSafetyBlockOrNoTextIsAFailure() {
        server.expect(requestTo(URL)).andRespond(withSuccess(answer("SAFETY", "[]"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andRespond(withSuccess(answer("STOP", "[]"), MediaType.APPLICATION_JSON));
        GeminiProvider gemini = provider(10);
        assertThatThrownBy(() -> gemini.generateJson("s", "u")).isInstanceOf(AiException.class).hasMessageContaining("SAFETY");
        assertThatThrownBy(() -> gemini.generateJson("s", "u")).isInstanceOf(AiException.class).hasMessageContaining("no text");
    }

    @Test
    void anExhaustedQuotaPausesCallsSoTheRulesAnswer() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        GeminiProvider gemini = provider(10);
        assertThatThrownBy(() -> gemini.generateJson("s", "u")).isInstanceOf(AiException.class).hasMessageContaining("quota");
        assertThat(gemini.isAvailable()).isFalse();
        assertThatThrownBy(() -> gemini.generateJson("s", "u")).isInstanceOf(AiException.class).hasMessageContaining("budget");
        server.verify(); // the second call never reached Gemini

        clock.advance(Duration.ofMinutes(5));
        assertThat(gemini.isAvailable()).isTrue();
    }

    @Test
    void otherFailuresDoNotPause() {
        server.expect(requestTo(URL)).andRespond(withServerError());
        GeminiProvider gemini = provider(10);
        assertThatThrownBy(() -> gemini.generateJson("s", "u")).isInstanceOf(AiException.class)
                .hasMessage("Gemini request failed with HTTP 500");
        assertThat(gemini.isAvailable()).isTrue();
    }

    @Test
    void theDailyLimitStopsCallsBeforeTheyAreMade() {
        server.expect(requestTo(URL)).andRespond(withSuccess(answer("STOP", "[{\"text\":\"{}\"}]"), MediaType.APPLICATION_JSON));
        GeminiProvider gemini = provider(1);
        assertThat(gemini.generateJson("s", "u")).isEqualTo("{}");
        assertThat(gemini.isAvailable()).isFalse();
        assertThatThrownBy(() -> gemini.generateJson("s", "u")).isInstanceOf(AiException.class);
        server.verify();
    }

    @Test
    void theKeyNeverAppearsInAnError() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":{\"message\":\"API key not valid: " + KEY + "\"}}"));
        assertThatThrownBy(() -> provider(10).generateJson("s", "u"))
                .isInstanceOf(AiException.class)
                .hasMessage("Gemini request failed with HTTP 400")
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain(KEY));
    }
}
