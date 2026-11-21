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
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

/**
 * Reads gift preferences out of a sentence, with no AI: "a birthday gift for my mom under ₹1,500, she loves perfume"
 * gives recipient "mom", occasion "birthday", budget 1500 and interest "fragrance". Whole words only, from the
 * {@link Vocabulary}. For one-answer questions (recipient, occasion, personality) the earliest mention wins; up to
 * three interests are kept in the order they appear. A budget needs a rupee sign or word ("₹1500", "2,000 rupees",
 * "1500/-"), a budget word ("under 2000", "budget of 3k") or a "k" ("2.5k"), so ages and quantities aren't budgets.
 * <p>
 * Things they don't like or already have are kept apart, never as interests: "she hates perfume", "no sweets",
 * "doesn't really like watches", "anything except flowers", "he already has a watch", and in Hinglish, Hindi or
 * Marathi with the "no" after the thing ("perfume pasand nahi", "perfume आवडत नाही", "chocolates नको"). The closest
 * cue within a few words decides, so "hates crowds, loves candles" still loves candles.
 * The answers come back for the {@link PreferenceNormalizer}.
 */
@Component
public class TextPreferenceParser {

    /**
     * The answers found in a sentence; null (or empty) when not mentioned.
     *
     * @param avoid what they don't like or already have, as written ("perfume", "chocolates")
     */
    public record Parsed(String recipient, String occasion, Integer budget, List<String> interests, String personality,
            List<String> avoid) {

        public Parsed {
            interests = List.copyOf(interests);
            avoid = List.copyOf(avoid);
        }

        /** Nothing to avoid. */
        public Parsed(String recipient, String occasion, Integer budget, List<String> interests, String personality) {
            this(recipient, occasion, budget, interests, personality, List.of());
        }
    }

    private static final int MAX_INTERESTS = 3;
    private static final int MAX_AVOID = 5;
    private static final int MAX_BUDGET = 1_000_000;

    private static final Map<String, Pattern> RECIPIENTS = words(Stream.concat(
            Vocabulary.RECIPIENTS.keySet().stream(), Stream.of("myself", "self")).toList());
    private static final Map<String, Pattern> OCCASIONS = words(Stream.concat(
            Vocabulary.OCCASIONS.keySet().stream(), Vocabulary.OCCASION_NAMES.stream()).toList());
    /** Everything a shopper may love or not: interests, categories and things to avoid. */
    private static final Map<String, Pattern> THINGS = words(Stream.of(Vocabulary.INTERESTS.keySet(),
            Vocabulary.CATEGORIES, Vocabulary.AVOID.keySet(), Vocabulary.AVOID_WORDS.keySet())
            .flatMap(Collection::stream).distinct().toList());
    private static final Map<String, Pattern> PERSONALITIES = words(Stream.concat(
            Vocabulary.PERSONALITIES.keySet().stream(), Vocabulary.PERSONALITY_NAMES.stream()).toList());

    // ── Negation ──
    /** Before the thing: it's something they don't like. Checked against the closest positive cue. */
    private static final Pattern NEGATIVE = cues("doesn't like", "doesnt like", "does not like", "don't like",
            "dont like", "do not like", "didn't like", "did not like", "doesn't want", "does not want", "don't want",
            "do not want", "doesn't need", "does not need", "can't stand", "cannot stand", "dislikes", "dislike",
            "hates", "hate", "not into", "not a fan of", "allergic to", "avoid", "except", "anything but",
            "nothing with", "without", "bina", "already has", "already have", "already owns", "already got",
            "already", "has enough", "sick of", "tired of", "no", "not");
    /** Before the thing: they like it, unless a "not" or "n't" comes just before ("doesn't really like"). */
    private static final Pattern POSITIVE = cues("loves", "love", "likes", "like", "enjoys", "enjoy", "into",
            "fan of", "adores", "adore", "wants", "want", "prefers", "prefer", "obsessed with", "crazy about",
            "interested in");
    /** A "no" or "not" that says nothing about the thing ("not sure", "no more than ₹2,000", "has no perfume yet"). */
    private static final Pattern NOT_NEGATION = cues("not sure", "no idea", "no clue", "no matter", "not too",
            "no more than", "not more than", "not over", "not above", "no budget", "no limit", "not fussy",
            "not picky", "has no", "have no");
    /** Right after the thing, in Hinglish, Hindi or Marathi: "perfume pasand nahi", "perfume आवडत नाही". */
    private static final Set<String> NEGATIVE_AFTER = Set.of("nahi", "nahin", "nai", "nako", "नाही", "नको", "नहीं",
            "नही");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{M}\\p{N}']+");
    /** A cue reaches this many words ahead ("hates perfume, watches and sweets"), no further. */
    private static final int CUE_REACH = 6;
    /** "Not" this many words before a positive cue turns it ("isn't a big fan of"). */
    private static final int NEGATOR_REACH = 3;
    private static final int AFTER_REACH = 3;

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
        Things things = things(t);
        return new Parsed(first(t, RECIPIENTS), first(t, OCCASIONS), budget(t), things.interests(),
                first(t, PERSONALITIES), things.avoid());
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

    /** Interests as categories (at most three) and things to avoid as written (at most five), each once, in order. */
    private record Things(List<String> interests, List<String> avoid) {
    }

    private static Things things(String text) {
        record Mention(int at, int end, String term) {
        }
        List<Mention> mentions = new ArrayList<>();
        THINGS.forEach((term, pattern) -> {
            Matcher m = pattern.matcher(text);
            while (m.find()) {
                mentions.add(new Mention(m.start(), m.end(), term));
            }
        });
        mentions.sort(Comparator.comparingInt(Mention::at).thenComparing(m -> -m.term().length()));
        Set<String> interests = new LinkedHashSet<>();
        Set<String> avoid = new LinkedHashSet<>();
        int covered = 0;
        for (Mention m : mentions) {
            if (m.at() < covered) {
                continue; // part of a longer mention ("sweets" in "food & sweets")
            }
            covered = m.end();
            if (negated(text, m.at(), m.end())) {
                avoid.add(m.term());
            } else if (Vocabulary.INTERESTS.containsKey(m.term()) || Vocabulary.CATEGORIES.contains(m.term())) {
                interests.add(Vocabulary.INTERESTS.getOrDefault(m.term(), m.term()));
            }
        }
        return new Things(interests.stream().limit(MAX_INTERESTS).toList(), avoid.stream().limit(MAX_AVOID).toList());
    }

    /**
     * Whether the thing at [start, end) is something they don't like: "nahi"/"नाही"/"नको" just after it, or, before it
     * in the same sentence, a negative cue closer than any positive one, or a positive cue turned by a "not" or "n't"
     * just before it. A cue counts only within {@link #CUE_REACH} words.
     */
    private static boolean negated(String text, int start, int end) {
        int clauseEnd = indexOfAny(text, ",.!?;\n", end);
        if (words(text.substring(end, clauseEnd)).stream().limit(AFTER_REACH).anyMatch(NEGATIVE_AFTER::contains)) {
            return true;
        }
        String before = text.substring(lastIndexOfAny(text, ".!?;\n", start) + 1, start);
        List<int[]> ignored = spans(NOT_NEGATION, before);
        int[] negative = spans(NEGATIVE, before).stream()
                .filter(c -> ignored.stream().noneMatch(i -> c[0] >= i[0] && c[1] <= i[1])).reduce((a, b) -> b)
                .orElse(null);
        int[] positive = spans(POSITIVE, before).stream().reduce((a, b) -> b).orElse(null);
        int[] cue;
        boolean isNegative;
        if (negative != null && (positive == null || negative[1] >= positive[1])) {
            cue = negative; // at the same place the negative phrase wins: "doesn't like" over "like"
            isNegative = true;
        } else if (positive != null) {
            cue = positive;
            List<String> lead = words(before.substring(0, positive[0]));
            isNegative = lead.subList(Math.max(0, lead.size() - NEGATOR_REACH), lead.size()).stream()
                    .anyMatch(w -> w.equals("not") || w.equals("no") || w.equals("never") || w.endsWith("n't"));
        } else {
            return false;
        }
        return isNegative && words(before.substring(cue[1])).size() <= CUE_REACH;
    }

    private static Pattern cues(String... phrases) {
        String alternatives = Stream.of(phrases).sorted(Comparator.comparingInt(String::length).reversed())
                .map(Pattern::quote).collect(Collectors.joining("|"));
        return Pattern.compile("(?<![\\p{L}\\p{M}\\p{N}'])(?:" + alternatives + ")(?![\\p{L}\\p{M}\\p{N}'])");
    }

    /** Where each match is, as {start, end}, in order. */
    private static List<int[]> spans(Pattern p, String text) {
        List<int[]> out = new ArrayList<>();
        Matcher m = p.matcher(text);
        while (m.find()) {
            out.add(new int[] { m.start(), m.end() });
        }
        return out;
    }

    private static List<String> words(String text) {
        List<String> out = new ArrayList<>();
        Matcher m = WORD.matcher(text);
        while (m.find()) {
            out.add(m.group());
        }
        return out;
    }

    private static int indexOfAny(String text, String chars, int from) {
        for (int i = from; i < text.length(); i++) {
            if (chars.indexOf(text.charAt(i)) >= 0) {
                return i;
            }
        }
        return text.length();
    }

    private static int lastIndexOfAny(String text, String chars, int before) {
        for (int i = before - 1; i >= 0; i--) {
            if (chars.indexOf(text.charAt(i)) >= 0) {
                return i;
            }
        }
        return -1;
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
