package com.giftgenius.ai.provider;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import com.giftgenius.config.AppProperties;

/** Chooses the model once, at startup: Gemini when enabled and a key is configured, otherwise none. */
@Configuration
public class AiProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(AiProviderConfig.class);

    @Bean
    AiProvider aiProvider(@Qualifier("geminiRestClient") RestClient http, AppProperties properties) {
        return choose(http, properties.ai(), Clock.systemUTC());
    }

    static AiProvider choose(RestClient http, AppProperties.Ai ai, Clock clock) {
        if (!ai.enabled() || !StringUtils.hasText(ai.apiKey())) {
            log.info("AI features answer from rules: {}", ai.enabled() ? "GEMINI_API_KEY is not set" : "AI is disabled");
            return new DisabledAiProvider();
        }
        log.info("AI features use Gemini model {}, at most {} calls a day", ai.model(), ai.dailyCallLimit());
        return new GeminiProvider(http, ai, new AiBudget(ai.dailyCallLimit(), ai.quotaCooldown(), clock));
    }
}
