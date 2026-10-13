package com.giftgenius.ai.dto;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AiDtos {

    private AiDtos() {
    }

    /**
     * The quiz's fixed choices (e.g. "partner", "food & sweets") reach the model outside the delimited notes,
     * so they are held to plain words: no line breaks, brackets or punctuation to smuggle instructions in.
     */
    static final String CHOICE = "^[\\p{L}\\p{M} &'-]*$";
    static final String CHOICE_MESSAGE = "Choose one of the listed options";

    public record RecommendationRequest(
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String recipient,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String occasion,
            @Min(0) @Max(1_000_000) Integer budget,
            @Size(max = 10) List<@Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String> interests,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String personality,
            @Size(max = 600, message = "Keep the notes under 600 characters") String notes,
            @Min(1) @Max(8) Integer limit) {
    }

    public record Pick(ProductDto product, String reason, double score) {
    }

    /** source is "ai" when Gemini ranked the picks, "rules" when the scoring engine did. */
    public record RecommendationResponse(String source, String summary, List<Pick> picks, String giftMessage) {
    }

    public record GiftMessageRequest(
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String recipient,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String occasion,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String tone,
            @Size(max = 150) String productName,
            @Size(max = 60) String senderName,
            @Size(max = 400) String notes) {
    }

    public record GiftMessageResponse(String source, List<String> messages) {
    }

    /** A gift request in the shopper's own words, e.g. "a birthday gift for my mom under 1500, she loves perfume". */
    public record GiftRequest(
            @NotBlank(message = "Tell us a little about the gift you're looking for")
            @Size(max = 500, message = "Keep it under 500 characters") String text,
            @Min(1) @Max(8) Integer limit) {
    }

    /** What was understood from a gift request, in the catalogue's terms; by is "ai" or "rules". */
    public record Understood(String recipient, String occasion, Integer budget, List<String> interests,
            String personality, String by) {
    }

    /** source is who ranked and explained the picks ("ai" or "rules"), as for the quiz. */
    public record GiftRequestResponse(String source, Understood understood, String summary, List<Pick> picks,
            String giftMessage) {
    }
}
