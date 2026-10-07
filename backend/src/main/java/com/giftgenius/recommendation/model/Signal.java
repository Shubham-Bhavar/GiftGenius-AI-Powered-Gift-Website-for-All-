package com.giftgenius.recommendation.model;

/** The kinds of evidence a product can earn points for. */
public enum Signal {
    OCCASION,
    WITHIN_BUDGET,
    COMFORTABLY_IN_BUDGET,
    OVER_BUDGET,
    RECIPIENT,
    INTEREST,
    PERSONALITY,
    RATING,
    /** Nothing matched, so the product was picked as one of the best-rated. */
    TOP_RATED
}
