package com.giftgenius.recommendation.engine;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.giftgenius.recommendation.engine.Vocabulary.Who;
import com.giftgenius.recommendation.model.GiftPreferences;

/**
 * Turns a shopper's answers (from the quiz, or extracted from a sentence) into the catalogue's vocabulary:
 * "mummy" → a parent, for her; "diwali" → festival; "perfume" → fragrance; "luxury" → a premium preference.
 * Unknown words pass through lower-cased, so the catalogue's own terms always work. See {@link Vocabulary}.
 */
@Component
public class PreferenceNormalizer {

    public GiftPreferences normalize(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
        String who = term(recipient);
        boolean self = who != null && Vocabulary.SELF.contains(who);
        Who match = who == null || self ? null : Vocabulary.RECIPIENTS.get(who);
        String relationship = who == null || self ? null : match != null ? match.relationship() : who;
        Set<String> terms = new LinkedHashSet<>();
        if (match != null && match.specific() != null) {
            terms.add(match.specific());
        }
        if (relationship != null) {
            terms.add(relationship);
        }
        String personalityTerm = term(personality);
        List<String> interestTerms = interests == null ? List.of()
                : interests.stream().map(this::term).filter(Objects::nonNull)
                        .map(i -> Vocabulary.INTERESTS.getOrDefault(i, i)).distinct().toList();
        return new GiftPreferences(relationship, terms, match == null ? null : match.forWhom(),
                canonical(Vocabulary.OCCASIONS, term(occasion)), budget, interestTerms,
                canonical(Vocabulary.PERSONALITIES, personalityTerm),
                personalityTerm != null && Vocabulary.PREMIUM_WORDS.contains(personalityTerm));
    }

    /** One answer: trimmed and lower-case; blank means "not answered" (null). */
    public String term(String raw) {
        return raw == null || raw.isBlank() ? null : raw.trim().toLowerCase(Locale.ROOT);
    }

    private static String canonical(Map<String, String> synonyms, String term) {
        return term == null ? null : synonyms.getOrDefault(term, term);
    }
}
