package com.giftgenius.recommendation.engine;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.Recommendation;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

/**
 * Explains recommendations from their matches: each gets its reasons as short clauses, strongest first, and one
 * sentence for the shopper, e.g. "Made for birthdays, fits your ₹1,500 budget and personalised just for them."
 * <p>
 * Across a set of picks, each sentence leads with the pick's strongest reason and then says what sets it apart:
 * reasons every pick shares (the occasion, the budget) give way to its own (their interest, its rating), so four picks
 * don't read the same. Being over budget is always said.
 */
@Component
public class ExplanationService {

    /** A clause, the signal behind it, and its points (stronger reasons come first). */
    private record Clause(Signal signal, String text, double points) {
    }

    private static final String NOTHING_SPECIFIC = "A thoughtful, highly rated choice.";
    private static final int SENTENCE_CLAUSES = 3;
    /** Ratings are quoted ("rated 4.8★ by 120 shoppers") from this rating, with enough reviews. */
    private static final double QUOTE_RATING_FROM = 4.5;
    private static final Map<String, String> PLURAL = Map.of("parent", "parents", "mother", "mothers",
            "father", "fathers", "partner", "partners", "friend", "friends", "sibling", "siblings",
            "colleague", "colleagues");
    private static final Map<String, String> INTEREST_LABEL = Map.of("cultural", "art and culture",
            "food & sweets", "food and sweets", "gift sets", "gift hampers");
    /** In the shopper's words: the quiz's "Luxury & Premium" is the catalogue's "expressive", and so on. */
    private static final Map<String, String> PERSONALITY_CLAUSE = Map.of(
            "expressive", "for someone who loves a little luxury",
            "creative", "for their fun, creative side",
            "practical", "practical and useful");

    private final RecommendationWeights weights;

    public ExplanationService(RecommendationWeights weights) {
        this.weights = weights;
    }

    /** The final picks, each with its reasons and its sentence. */
    public List<Recommendation> explain(List<ScoredProduct> picks, GiftPreferences prefs) {
        List<List<Clause>> clauses = picks.stream().map(s -> clauses(s, prefs)).toList();
        Set<Signal> shared = shared(clauses);
        List<Recommendation> out = new ArrayList<>();
        for (int i = 0; i < picks.size(); i++) {
            ScoredProduct s = picks.get(i);
            out.add(new Recommendation(s.product(), s.score(), texts(clauses.get(i)),
                    sentence(s, prefs, clauses.get(i), shared)));
        }
        return out;
    }

    /** The reasons as clauses, strongest first (e.g. "made for birthdays", "fits your ₹1,500 budget"). */
    public List<String> reasons(ScoredProduct s, GiftPreferences prefs) {
        return texts(clauses(s, prefs));
    }

    /** The sentence for a recommendation on its own: its three strongest reasons. */
    public String summary(ScoredProduct s, GiftPreferences prefs) {
        return sentence(s, prefs, clauses(s, prefs), Set.of());
    }

    private String sentence(ScoredProduct s, GiftPreferences prefs, List<Clause> clauses, Set<Signal> shared) {
        List<Clause> ordered = new ArrayList<>();
        if (!clauses.isEmpty()) {
            ordered.add(clauses.get(0)); // its strongest reason leads
            clauses.stream().skip(1).filter(c -> !shared.contains(c.signal())).forEach(ordered::add);
            clauses.stream().skip(1).filter(c -> shared.contains(c.signal())).forEach(ordered::add);
        }
        String overBudget = s.has(Signal.OVER_BUDGET) ? "just over your " + rupees(prefs.budget()) + " budget" : null;
        List<String> parts = texts(ordered).stream().limit(SENTENCE_CLAUSES).toList();
        if (parts.isEmpty()) {
            return overBudget == null ? NOTHING_SPECIFIC : capitalise(overBudget) + ".";
        }
        String sentence = joinNaturally(parts);
        return capitalise(overBudget == null ? sentence : sentence + ", " + overBudget) + ".";
    }

    /**
     * The reasons every pick gives for fitting the shopper's answers. Facts about a product (its rating, sales,
     * newness) are its own even when every pick has one; a single pick shares nothing.
     */
    private static Set<Signal> shared(List<List<Clause>> picks) {
        if (picks.size() < 2) {
            return Set.of();
        }
        Set<Signal> shared = null;
        for (List<Clause> clauses : picks) {
            Set<Signal> signals = EnumSet.noneOf(Signal.class);
            clauses.stream().map(Clause::signal).filter(sig -> sig.kind() == Signal.Kind.FIT).forEach(signals::add);
            if (shared == null) {
                shared = signals;
            } else {
                shared.retainAll(signals);
            }
        }
        return shared;
    }

    private static List<String> texts(List<Clause> clauses) {
        return clauses.stream().map(Clause::text).toList();
    }

    private List<Clause> clauses(ScoredProduct s, GiftPreferences prefs) {
        List<Clause> out = new ArrayList<>();
        boolean comfortably = s.has(Signal.COMFORTABLY_IN_BUDGET);
        boolean recipientSaid = s.has(Signal.RECIPIENT); // "a favourite for mothers" already says who
        ProductDto p = s.product();
        for (Match m : s.matches()) {
            String text = switch (m.signal()) {
                case OCCASION -> "made for " + occasionLabel(m.value());
                case WITHIN_BUDGET -> (comfortably ? "well within your " : "fits your ") + rupees(prefs.budget()) + " budget";
                case RECIPIENT -> "a favourite for " + PLURAL.getOrDefault(m.value(), m.value() + "s");
                case FOR_WHOM -> recipientSaid ? null : "picked for " + m.value();
                case INTEREST -> "personalized".equals(m.value()) ? "personalised just for them"
                        : "matches their love of " + INTEREST_LABEL.getOrDefault(m.value(), m.value());
                case PREMIUM -> "a premium pick";
                case PERSONALITY -> PERSONALITY_CLAUSE.getOrDefault(m.value(),
                        "suits " + withArticle(m.value()) + " personality");
                case FESTIVE -> p.isCultural() ? "rooted in Indian tradition" : "part of our festive collection";
                case POPULARITY -> m.points() >= weights.quality().popularity() * weights.quality().bestsellerShare()
                        ? "a bestseller right now" : null;
                case RATING -> p.reviewCount() >= weights.quality().wellReviewedMin()
                        && p.rating().doubleValue() >= QUOTE_RATING_FROM
                                ? "rated " + p.rating().stripTrailingZeros().toPlainString() + "★ by " + p.reviewCount()
                                        + " shoppers"
                                : null;
                case NEW_ARRIVAL -> "new in our catalogue";
                case TOP_RATED -> "one of our highest-rated gifts";
                case COMFORTABLY_IN_BUDGET, OVER_BUDGET, NOT_FOR_WHOM, REVIEWS, PERSONAL -> null;
            };
            if (text != null) {
                out.add(new Clause(m.signal(), text, m.points()));
            }
        }
        out.sort(Comparator.comparingDouble(Clause::points).reversed()); // stable: equal points keep match order
        return out;
    }

    static String occasionLabel(String occasion) {
        return switch (occasion) {
            case "birthday" -> "birthdays";
            case "anniversary" -> "anniversaries";
            case "graduation" -> "graduations";
            case "valentine" -> "Valentine's Day";
            case "festival" -> "festive celebrations";
            case "baby" -> "welcoming a new baby";
            case "achievement" -> "celebrating an achievement";
            default -> occasion;
        };
    }

    /** Indian digit grouping, as the shop shows prices: ₹1,500 and ₹1,50,000. */
    static String rupees(int amount) {
        String digits = Integer.toString(amount);
        if (digits.length() <= 3) {
            return "₹" + digits;
        }
        String thousands = digits.substring(0, digits.length() - 3);
        return "₹" + thousands.replaceAll("\\B(?=(\\d{2})+$)", ",") + "," + digits.substring(digits.length() - 3);
    }

    private static String withArticle(String word) {
        return ("aeiou".indexOf(word.charAt(0)) >= 0 ? "an " : "a ") + word;
    }

    private static String joinNaturally(List<String> parts) {
        if (parts.size() == 1) {
            return parts.get(0);
        }
        return String.join(", ", parts.subList(0, parts.size() - 1)) + " and " + parts.get(parts.size() - 1);
    }

    private static String capitalise(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
