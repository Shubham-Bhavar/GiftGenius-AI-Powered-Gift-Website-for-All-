package com.giftgenius.giftbox;

import java.util.List;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public final class GiftBoxDtos {

    private GiftBoxDtos() {
    }

    /** The same plain-word rule as the quiz's choices. */
    static final String CHOICE = "^[\\p{L}\\p{M} &'-]*$";
    static final String CHOICE_MESSAGE = "Choose one of the listed options";

    /**
     * Boxes of several gifts that together fit a budget.
     *
     * @param size gifts per box, 2 to 4 (default 3)
     */
    public record SuggestionRequest(
            @NotNull(message = "Set a budget for the box") @Min(1) @Max(1_000_000) Integer budget,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String recipient,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String occasion,
            @Size(max = 10) List<@Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String> interests,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String personality,
            @Size(max = 10) List<@Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String> avoid,
            @Min(2) @Max(4) Integer size) {
    }

    /** Products the shopper put in a box, to check how well they go together. */
    public record CheckRequest(
            @NotEmpty(message = "Put at least one gift in the box") @Size(max = 6) List<@NotNull @Positive Long> productIds,
            @Min(1) @Max(1_000_000) Integer budget,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String occasion,
            @Size(max = 30) @Pattern(regexp = CHOICE, message = CHOICE_MESSAGE) String recipient) {
    }

    /**
     * One dimension of a box's compatibility, worked out from product attributes by explicit rules.
     *
     * @param dimension occasion, price, balance, style, variety, recipient or packaging
     * @param status    good, warn, bad, info, or unknown (the catalogue can't tell yet)
     */
    public record BoxCheck(String dimension, String status, String text) {
    }

    public record BoxItem(ProductDto product, String reason) {
    }

    public record Box(List<BoxItem> items, int total, List<BoxCheck> checks) {
    }

    /** note explains an empty or partial answer (e.g. not enough different gifts within the budget). */
    public record SuggestionResponse(int budget, List<Box> boxes, String note) {
    }

    /** missing lists ids that can't be bought right now (not listed, or out of stock). */
    public record CheckResponse(int total, Integer budget, List<BoxCheck> checks, List<Long> missing) {
    }
}
