package com.giftgenius.recommendation.engine;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

/**
 * Reads gift preferences out of a sentence, with no AI: "a birthday gift for my mom under ₹1,500, she loves perfume"
 * gives recipient "mom", occasion "birthday", budget 1500 and interest "fragrance". Whole words only, from the
 * {@link Vocabulary}. For one-answer questions (recipient, occasion, personality) the earliest mention wins; up to
 * three interests are kept in the order they appear. A budget needs a rupee sign or word ("₹1500", "2,000 rupees",
 * "1500/-"), a budget word ("under 2000", "budget of 3k") or a "k" ("2.5k"), so ages and quantities aren't budgets.
 * The answers come back for the {@link PreferenceNormalizer}.
 */
@Component
public class TextPreferenceParser {

    /** The answers found in a sentence; null (or empty) when not mentioned. */
    public record Parsed(String recipient, String occasion, Integer budget, List<String> interests, String personality) {

        public Parsed {
            interests = List.copyOf(interests);
        }
    }

    private static final int MAX_INTERESTS = 3;
    private static final int MAX_BUDGET = 1_000_000;

    private static final Map<String, Pattern> RECIPIENTS = words(Stream.concat(
            Vocabulary.RECIPIENTS.keySet().stream(), Stream.of("myself", "self")).toList());
    private static final Map<String, Pattern> OCCASIONS = words(Stream.concat(
            Vocabulary.OCCASIONS.keySet().stream(), Vocabulary.OCCASION_NAMES.stream()).toList());
    private static final Map<String, Pattern> INTERESTS = words(Stream.concat(
            Vocabulary.INTERESTS.keySet().stream(), Vocabulary.CATEGORIES.stream()).toList());
    private static final Map<String, Pattern> PERSONALITIES = words(Stream.concat(
            Vocabulary.PERSONALITIES.keySet().stream(), Vocabulary.PERSONALITY_NAMES.stream()).toList());

    private static final String AMOUNT = "(\\d[\\d,]*(?:\\.\\d+)?)(\\s*k(?!\\p{L}))?";
    private static final List<Pattern> BUDGETS = List.of(
            Pattern.compile("(?:₹|(?<!\\p{L})rs\\.?|(?<!\\p{L})inr)\\s*" + AMOUNT),
            Pattern.compile(AMOUNT + "\\s*(?:rupees|rs(?!\\p{L})|inr(?!\\p{L})|/-)"),
            Pattern.compile("(?<!\\p{L})(?:under|below|within|upto|up to|less than|max|maximum|budget(?: of| is)?"
                    + "|around|about)\\s+" + AMOUNT),
            Pattern.compile("(?<![\\p{L}\\p{N}.,])(\\d+(?:\\.\\d+)?)(\\s?k)(?!\\p{L})"));

    public Parsed parse(String text) {
        if (text == null || text.isBlank()) {
            return new Parsed(null, null, null, List.of(), null);
        }
        String t = text.toLowerCase(Locale.ROOT).replace('’', '\'');
        return new Parsed(first(t, RECIPIENTS), first(t, OCCASIONS), budget(t), interests(t), first(t, PERSONALITIES));
    }

    /** The term mentioned first; at the same place, the longer one ("best friend" over "friend"). */
    private static String first(String text, Map<String, Pattern> terms) {
        String best = null;
        int at = Integer.MAX_VALUE;
        for (Map.Entry<String, Pattern> e : terms.entrySet()) {
            Matcher m = e.getValue().matcher(text);
            if (m.find() && (m.start() < at || (m.start() == at && e.getKey().length() > best.length()))) {
                best = e.getKey();
                at = m.start();
            }
        }
        return best;
    }

    /** Interests in the order mentioned, as categories, each once, at most three. */
    private static List<String> interests(String text) {
        record Mention(int at, String term) {
        }
        List<Mention> mentions = new ArrayList<>();
        INTERESTS.forEach((term, pattern) -> {
            Matcher m = pattern.matcher(text);
            while (m.find()) {
                mentions.add(new Mention(m.start(), term));
            }
        });
        mentions.sort(Comparator.comparingInt(Mention::at).thenComparing(m -> -m.term().length()));
        Set<String> categories = new LinkedHashSet<>();
        for (Mention m : mentions) {
            categories.add(Vocabulary.INTERESTS.getOrDefault(m.term(), m.term()));
        }
        return categories.stream().limit(MAX_INTERESTS).toList();
    }

    private static Integer budget(String text) {
        for (Pattern p : BUDGETS) {
            Matcher m = p.matcher(text);
            if (m.find()) {
                return rupees(m.group(1), m.group(2) != null);
            }
        }
        return null;
    }

    private static Integer rupees(String number, boolean thousands) {
        BigDecimal amount = new BigDecimal(number.replace(",", ""));
        if (thousands) {
            amount = amount.multiply(BigDecimal.valueOf(1000));
        }
        int rupees = amount.setScale(0, RoundingMode.HALF_UP).min(BigDecimal.valueOf(MAX_BUDGET + 1L)).intValue();
        return rupees >= 1 && rupees <= MAX_BUDGET ? rupees : null;
    }

    private static Map<String, Pattern> words(Collection<String> terms) {
        Map<String, Pattern> out = new LinkedHashMap<>();
        for (String term : terms) {
            out.put(term, Pattern.compile("(?<![\\p{L}\\p{N}])" + Pattern.quote(term) + "(?![\\p{L}\\p{N}])"));
        }
        return out;
    }
}
