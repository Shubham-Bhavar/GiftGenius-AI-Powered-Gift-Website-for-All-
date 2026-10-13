package com.giftgenius.ai.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import com.giftgenius.ai.provider.AiProvider.AiException;
import com.giftgenius.config.AppProperties;

class AiProviderConfigTest {

    private static AiProvider choose(boolean enabled, String key) {
        AppProperties.Ai ai = new AppProperties.Ai(enabled, key, "gemini-test", "https://gemini.test",
                Duration.ofSeconds(5), 500, Duration.ofMinutes(5));
        return AiProviderConfig.choose(RestClient.create(), ai, Clock.systemUTC());
    }

    @Test
    void withoutAKeyTheRulesAnswer() {
        AiProvider none = choose(true, "");
        assertThat(none).isInstanceOf(DisabledAiProvider.class);
        assertThat(none.isAvailable()).isFalse();
        assertThatThrownBy(() -> none.generateJson("s", "u")).isInstanceOf(AiException.class);
        assertThat(choose(true, null)).isInstanceOf(DisabledAiProvider.class);
    }

    @Test
    void switchedOffEvenWithAKey() {
        assertThat(choose(false, "test-key-not-real")).isInstanceOf(DisabledAiProvider.class);
    }

    @Test
    void geminiWhenEnabledWithAKey() {
        AiProvider gemini = choose(true, "test-key-not-real");
        assertThat(gemini).isInstanceOf(GeminiProvider.class);
        assertThat(gemini.isAvailable()).isTrue();
    }
}
