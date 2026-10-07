package com.giftgenius.recommendation.engine;

import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.springframework.stereotype.Component;

import com.giftgenius.recommendation.model.GiftPreferences;

/** Turns a shopper's answers into the catalogue's vocabulary. */
@Component
public class PreferenceNormalizer {

    public GiftPreferences normalize(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
        List<String> normalizedInterests = interests == null ? List.of()
                : interests.stream().map(this::term).filter(Objects::nonNull).toList();
        return new GiftPreferences(term(recipient), term(occasion), budget, normalizedInterests, term(personality));
    }

    /** One answer: trimmed and lower-case; blank means "not answered" (null). */
    public String term(String raw) {
        return raw == null || raw.isBlank() ? null : raw.trim().toLowerCase(Locale.ROOT);
    }
}
