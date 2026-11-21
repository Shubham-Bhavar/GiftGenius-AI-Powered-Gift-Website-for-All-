package com.giftgenius.recommendation.engine;

import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.engine.RecommendationWeights.Budget;
import com.giftgenius.recommendation.engine.RecommendationWeights.Fit;
import com.giftgenius.recommendation.model.FitCheck;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

/**
 * How well a gift fits what the shopper told us: a match from 0 to 100 and a check for each answer, in their words
 * ("Matches their love of plants", "₹99 over your ₹1,000 budget"). Only the answers they gave count, each weighted
 * as the ranking weighs it, so the match says how much of what they asked for this gift meets. The product's rating
 * and sales rank it but aren't part of the match. With no answers there is nothing to match, and no percentage.
 */
final class FitReporter {

    /** @param match 0–100, or null when nothing was asked */
    record Report(Integer match, List<FitCheck> checks) {
    }

    /** "Not especially …" for each personality, in the quiz's words. */
    private static final Map<String, String> STYLE_WORD = Map.of("expressive", "luxurious", "creative",
            "fun or quirky", "minimalist", "minimalist", "practical", "practical", "extrovert", "outgoing", "introvert",
            "low-key");

    private final RecommendationWeights weights;

    FitReporter(RecommendationWeights weights) {
        this.weights = weights;
    }

    Report report(ScoredProduct s, GiftPreferences prefs) {
        Fit fit = weights.fit();
        Budget budget = weights.budget();
        ProductDto p = s.product();
        List<FitCheck> checks = new ArrayList<>();
        double possible = 0;
        double achieved = 0;

        if (!prefs.interests().isEmpty()) {
            possible += fit.interest();
            String loved = value(s, Signal.INTEREST);
            if (loved != null) {
                achieved += fit.interest();
                checks.add(new FitCheck("interest", true, "personalized".equals(loved) ? "Personalised just for them"
                        : "Matches their love of " + interestLabel(loved)));
            } else {
                checks.add(new FitCheck("interest", false, "Not one of their interests ("
                        + ExplanationService.joinNaturally(prefs.interests().stream()
                                .map(FitReporter::interestLabel).toList()) + ")"));
            }
        }
        if (prefs.hasBudget()) {
            possible += budget.within() + budget.comfortably();
            int price = p.price().setScale(0, RoundingMode.HALF_UP).intValue();
            String theirs = ExplanationService.rupees(prefs.budget()) + " budget";
            String priced = ExplanationService.rupees(price) + ": ";
            if (s.has(Signal.COMFORTABLY_IN_BUDGET)) {
                achieved += budget.within() + budget.comfortably();
                checks.add(new FitCheck("budget", true, priced + "well within your " + theirs));
            } else if (s.has(Signal.WITHIN_BUDGET)) {
                achieved += budget.within();
                checks.add(new FitCheck("budget", true, priced + "fits your " + theirs));
            } else {
                checks.add(new FitCheck("budget", false, priced
                        + ExplanationService.rupees(Math.max(price - prefs.budget(), 1)) + " over your " + theirs));
            }
        }
        if (prefs.occasion() != null) {
            boolean festival = "festival".equals(prefs.occasion());
            possible += fit.occasion() + (festival ? fit.festive() : 0);
            achieved += (s.has(Signal.OCCASION) ? fit.occasion() : 0) + (s.has(Signal.FESTIVE) ? fit.festive() : 0);
            String occasion = ExplanationService.occasionLabel(prefs.occasion());
            checks.add(s.has(Signal.OCCASION) || s.has(Signal.FESTIVE)
                    ? new FitCheck("occasion", true, "Made for " + occasion)
                    : new FitCheck("occasion", false, "Not made especially for " + occasion));
        }
        if (prefs.recipient() != null) {
            possible += fit.recipient() + (prefs.forWhom() != null && !p.forWhom().isEmpty() ? fit.forWhom() : 0);
            achieved += (s.has(Signal.RECIPIENT) ? fit.recipient() : 0) + (s.has(Signal.FOR_WHOM) ? fit.forWhom() : 0);
            String who = value(s, Signal.RECIPIENT);
            if (s.has(Signal.NOT_FOR_WHOM)) {
                checks.add(new FitCheck("recipient", false,
                        "Usually chosen for " + ("her".equals(prefs.forWhom()) ? "him" : "her")));
            } else if (who != null) {
                checks.add(new FitCheck("recipient", true, "A favourite for " + plural(who)));
            } else {
                checks.add(new FitCheck("recipient", false, "Not one of our usual picks for " + plural(prefs.recipient())));
            }
        }
        if (prefs.personality() != null) {
            possible += fit.personality();
            if (s.has(Signal.PERSONALITY)) {
                achieved += fit.personality();
                checks.add(new FitCheck("style", true, ExplanationService.capitalise(
                        ExplanationService.PERSONALITY_CLAUSE.getOrDefault(prefs.personality(),
                                "suits " + ExplanationService.withArticle(prefs.personality()) + " personality"))));
            } else {
                checks.add(new FitCheck("style", false,
                        "Not especially " + STYLE_WORD.getOrDefault(prefs.personality(), prefs.personality())));
            }
        }
        if (prefs.premium()) {
            possible += fit.premium();
            if (s.has(Signal.PREMIUM)) {
                achieved += fit.premium();
            }
            checks.add(new FitCheck("premium", s.has(Signal.PREMIUM),
                    s.has(Signal.PREMIUM) ? "A premium pick" : "Not one of our premium gifts"));
        }
        if (!prefs.avoid().isEmpty()) {
            // Everything shown passed the avoid filter; saying so is what makes the list trustworthy.
            checks.add(new FitCheck("avoid", true,
                    "Steers clear of " + ExplanationService.joinNaturally(List.copyOf(prefs.avoid()))));
        }
        Integer match = possible == 0 ? null : (int) Math.round(Math.max(0, Math.min(100, 100 * achieved / possible)));
        return new Report(match, checks);
    }

    private static String value(ScoredProduct s, Signal signal) {
        return s.matches().stream().filter(m -> m.signal() == signal).map(Match::value).findFirst().orElse(null);
    }

    private static String interestLabel(String interest) {
        return ExplanationService.INTEREST_LABEL.getOrDefault(interest, interest);
    }

    private static String plural(String relationship) {
        return ExplanationService.PLURAL.getOrDefault(relationship, relationship + "s");
    }
}
