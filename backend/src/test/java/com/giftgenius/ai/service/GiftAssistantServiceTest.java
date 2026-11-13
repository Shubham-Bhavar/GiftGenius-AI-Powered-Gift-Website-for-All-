package com.giftgenius.ai.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.recommendation.model.GiftPreferences;

class GiftAssistantServiceTest {

    @Test
    void theConversationIsReadNewestFirstSoACorrectionWins() {
        assertThat(GiftAssistantService.conversation(List.of("for my mom under 1500", "  ", "actually under 800")))
                .isEqualTo("actually under 800. for my mom under 1500");
        assertThat(GiftAssistantService.conversation(Arrays.asList("a", null))).isEqualTo("a");
    }

    @Test
    void aLongConversationKeepsTheNewestMessagesWithinTheLimit() {
        String old = "o".repeat(500);
        String text = GiftAssistantService.conversation(List.of(old, old, old, "newest"));
        assertThat(text).startsWith("newest").hasSizeLessThanOrEqualTo(GiftAssistantService.MAX_TEXT);
        assertThat(text.chars().filter(c -> c == 'o').count()).isEqualTo(1_000);
    }

    @Test
    void modelWrittenPriceDiscountOrStockClaimsAreRecognised() {
        for (String claim : List.of("Only ₹99 today!", "Rs. 499 only", "Get 90% off", "A great discount", "Use coupon GIFT",
                "On sale now", "Limited offer", "Only 2 left", "Back in stock", "Free delivery", "Lowest price", "200 rupees")) {
            assertThat(GiftAssistantService.claims(claim)).as(claim).isTrue();
        }
        for (String fine : List.of("A warm, personal gift she'll use every day.", "Perfect for a tea lover.",
                "Something to remember the day by.", "Offbeat and fun", "Stockholm-inspired design")) {
            assertThat(GiftAssistantService.claims(fine)).as(fine).isFalse();
        }
        assertThat(GiftAssistantService.claims(null)).isFalse();
    }

    @Test
    void itAsksForTheRecipientThenTheOccasionThenTheBudget() {
        assertThat(GiftAssistantService.question(new GiftPreferences(null, "birthday", 1000, List.of(), null)))
                .isEqualTo(GiftAssistantService.ASK_RECIPIENT);
        assertThat(GiftAssistantService.question(new GiftPreferences("parent", null, 1000, List.of(), null)))
                .isEqualTo(GiftAssistantService.ASK_OCCASION);
        assertThat(GiftAssistantService.question(new GiftPreferences("parent", "birthday", null, List.of(), null)))
                .isEqualTo(GiftAssistantService.ASK_BUDGET);
        assertThat(GiftAssistantService.question(new GiftPreferences("parent", "birthday", 0, List.of(), null)))
                .as("no budget").isEqualTo(GiftAssistantService.ASK_BUDGET);
        assertThat(GiftAssistantService.question(new GiftPreferences("parent", "birthday", 1000, List.of(), null)))
                .isNull();
    }
}
