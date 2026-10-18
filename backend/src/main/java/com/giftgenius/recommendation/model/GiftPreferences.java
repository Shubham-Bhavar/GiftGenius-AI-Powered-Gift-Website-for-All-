package com.giftgenius.recommendation.model;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * What the shopper told us, in the catalogue's vocabulary. Any field may be null (or empty) when it wasn't answered.
 *
 * @param recipient      canonical relationship ("parent", "partner", "friend", "sibling", "colleague")
 * @param recipientTerms relationships a product may be tagged with for this recipient, most specific first
 *                       (e.g. "mother", "parent" for "mom")
 * @param forWhom        "her" or "him" when the recipient implies it
 * @param occasion       e.g. "birthday", "festival"
 * @param budget         rupees; null or ≤ 0 means flexible
 * @param interests      categories or tags they love (e.g. "fragrance", "personalized")
 * @param personality    e.g. "minimalist", "expressive"
 * @param premium        they asked for something luxurious
 */
public record GiftPreferences(String recipient, Set<String> recipientTerms, String forWhom, String occasion,
        Integer budget, List<String> interests, String personality, boolean premium) {

    public GiftPreferences {
        recipientTerms = recipientTerms == null ? Set.of() : Collections.unmodifiableSet(new LinkedHashSet<>(recipientTerms));
        interests = interests == null ? List.of() : List.copyOf(interests);
    }

    /** Preferences already in the catalogue's vocabulary, with no gender or premium hint. */
    public GiftPreferences(String recipient, String occasion, Integer budget, List<String> interests, String personality) {
        this(recipient, recipient == null ? Set.of() : Set.of(recipient), null, occasion, budget, interests, personality,
                false);
    }

    public boolean hasBudget() {
        return budget != null && budget > 0;
    }

    /** They told us nothing at all. */
    public boolean isEmpty() {
        return recipient == null && occasion == null && !hasBudget() && interests.isEmpty() && personality == null
                && !premium;
    }
}
