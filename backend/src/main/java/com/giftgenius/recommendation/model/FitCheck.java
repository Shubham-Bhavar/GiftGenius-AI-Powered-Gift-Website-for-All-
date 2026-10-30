package com.giftgenius.recommendation.model;

/**
 * One thing the shopper told us, and whether a gift meets it, in their words: "Made for birthdays",
 * "₹99 over your ₹1,000 budget".
 *
 * @param criterion what it checks: interest, budget, occasion, recipient, style, premium or avoid
 */
public record FitCheck(String criterion, boolean met, String text) {
}
