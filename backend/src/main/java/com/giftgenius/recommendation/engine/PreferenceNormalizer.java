package com.giftgenius.recommendation.engine;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.giftgenius.recommendation.engine.Vocabulary.Who;
import com.giftgenius.recommendation.model.GiftPreferences;

/**
 * Turns a shopper's answers (from the quiz, or extracted from a sentence) into the catalogue's vocabulary:
 * "mummy" → a parent, for her; "diwali" → festival; "perfume" → fragrance; "luxury" → a premium preference;
 * "chocolates" to avoid → sweets. Unknown words pass through lower-cased, so the catalogue's own terms always work.
 * What they don't like wins over an interest it rules out ("loves flowers and perfume, but no perfume"). See
 * {@link Vocabulary} and {@link AvoidList}.
 */
@Component
public class PreferenceNormalizer {

    /** At most this many things to avoid (the quiz offers eight). */
    static final int MAX_AVOID = 10;

    public GiftPreferences normalize(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
        return normalize(recipient, occasion, budget, interests, personality, List.of());
    }

    public GiftPreferences normalize(String recipient, String occasion, Integer budget, List<String> interests,
            String personality, List<String> avoid) {
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
        Set<String> avoidTerms = avoid == null ? Set.of()
                : avoid.stream().map(this::term).filter(Objects::nonNull).map(AvoidList::canonical).distinct()
                        .limit(MAX_AVOID).collect(Collectors.toCollection(LinkedHashSet::new));
        List<String> interestTerms = interests == null ? List.of()
                : interests.stream().map(this::term).filter(Objects::nonNull)
                        .map(i -> Vocabulary.INTERESTS.getOrDefault(i, i)).distinct()
                        .filter(i -> !AvoidList.covers(avoidTerms, i)).toList();
        return new GiftPreferences(relationship, terms, match == null ? null : match.forWhom(),
                canonical(Vocabulary.OCCASIONS, term(occasion)), budget, interestTerms,
                canonical(Vocabulary.PERSONALITIES, personalityTerm),
                personalityTerm != null && Vocabulary.PREMIUM_WORDS.contains(personalityTerm), avoidTerms);
    }

    /** One answer: trimmed and lower-case; blank means "not answered" (null). */
    public String term(String raw) {
        return raw == null || raw.isBlank() ? null : raw.trim().toLowerCase(Locale.ROOT);
    }

    private static String canonical(Map<String, String> synonyms, String term) {
        return term == null ? null : synonyms.getOrDefault(term, term);
    }
}
