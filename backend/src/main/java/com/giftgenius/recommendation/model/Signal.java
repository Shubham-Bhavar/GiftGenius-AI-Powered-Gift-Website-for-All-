package com.giftgenius.recommendation.model;

/** The kinds of evidence a product can earn (or lose) points for. */
public enum Signal {
    OCCASION(Kind.FIT),
    WITHIN_BUDGET(Kind.FIT),
    COMFORTABLY_IN_BUDGET(Kind.FIT),
    OVER_BUDGET(Kind.PENALTY),
    RECIPIENT(Kind.FIT),
    FOR_WHOM(Kind.FIT),
    /** Made only for her when the gift is for him, or the other way round. */
    NOT_FOR_WHOM(Kind.PENALTY),
    INTEREST(Kind.FIT),
    PREMIUM(Kind.FIT),
    PERSONALITY(Kind.FIT),
    /** A festival gift that is also a festive or cultural product. */
    FESTIVE(Kind.FIT),
    /** A shopper-specific boost (personalisation extension point). */
    PERSONAL(Kind.FIT),
    /** Sold well recently. */
    POPULARITY(Kind.QUALITY),
    /** Many shoppers have reviewed it. */
    REVIEWS(Kind.QUALITY),
    RATING(Kind.QUALITY),
    /** No reviews yet: rated with a neutral prior instead (cold start). Worth no points by itself. */
    NEW_ARRIVAL(Kind.NOTE),
    /** Nothing fitted, so the product was picked as one of the best on quality alone. */
    TOP_RATED(Kind.NOTE);

    public enum Kind {
        /** Fits what the shopper asked for. */
        FIT,
        /** How good the product is for anyone. */
        QUALITY,
        PENALTY,
        /** Worth no points; only explains. */
        NOTE
    }

    private final Kind kind;

    Signal(Kind kind) {
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
