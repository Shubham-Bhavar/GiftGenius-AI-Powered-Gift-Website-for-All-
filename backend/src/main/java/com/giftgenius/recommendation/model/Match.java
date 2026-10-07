package com.giftgenius.recommendation.model;

/** One reason a product scored: the signal, what matched (e.g. "anniversary"; may be null), and the points. */
public record Match(Signal signal, String value, double points) {
}
