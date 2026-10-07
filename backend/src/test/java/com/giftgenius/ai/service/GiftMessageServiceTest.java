package com.giftgenius.ai.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.giftgenius.ai.dto.AiDtos.GiftMessageRequest;
import com.giftgenius.ai.dto.AiDtos.GiftMessageResponse;
import com.giftgenius.ai.provider.AiProvider;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;

import tools.jackson.databind.json.JsonMapper;

class GiftMessageServiceTest {

    private static GiftMessageService service(AiProvider ai) {
        return new GiftMessageService(ai, new PreferenceNormalizer(), JsonMapper.builder().build());
    }

    private static AiProvider answering(String response) {
        return new AiProvider() {
            public boolean isAvailable() { return true; }
            public String generateJson(String s, String u) { return response; }
        };
    }

    private static final AiProvider UNAVAILABLE = new AiProvider() {
        public boolean isAvailable() { return false; }
        public String generateJson(String s, String u) { throw new AssertionError("an unavailable model was asked"); }
    };

    private static GiftMessageRequest request() {
        return new GiftMessageRequest("mother", "Diwali", "warm", "Pashmina Shawl", "Riya", null);
    }

    @Test
    void theModelsMessages() {
        GiftMessageResponse res = service(answering(
                "{\"messages\":[\"Happy Diwali, Maa!\",\"  Love you\\nalways. \",\"For the warmest hugs.\",\"A fourth\"]}"))
                .giftMessages(request());
        assertThat(res.source()).isEqualTo("ai");
        assertThat(res.messages()).containsExactly("Happy Diwali, Maa!", "Love you always.", "For the warmest hugs.");
    }

    @Test
    void templatesWhenNoModelIsAvailableUsingTheOccasionsMeaning() {
        GiftMessageResponse res = service(UNAVAILABLE).giftMessages(request());
        assertThat(res.source()).isEqualTo("rules");
        assertThat(res.messages()).hasSize(3);
        assertThat(res.messages().get(0)).startsWith("Wishing you light, laughter and sweetness this festive season.")
                .endsWith("With love, Riya.");
    }

    @Test
    void templatesWhenTheModelFailsOrAnswersBadly() {
        AiProvider failing = new AiProvider() {
            public boolean isAvailable() { return true; }
            public String generateJson(String s, String u) { throw new AiProvider.AiException("quota"); }
        };
        assertThat(service(failing).giftMessages(request()).source()).isEqualTo("rules");
        assertThat(service(answering("not json")).giftMessages(request()).source()).isEqualTo("rules");
        assertThat(service(answering("{\"messages\":\"one\"}")).giftMessages(request()).source()).isEqualTo("rules");
        assertThat(service(answering("{\"messages\":[\"Shop at https://x.example\",\"\"]}")).giftMessages(request())
                .source()).isEqualTo("rules");
    }
}
