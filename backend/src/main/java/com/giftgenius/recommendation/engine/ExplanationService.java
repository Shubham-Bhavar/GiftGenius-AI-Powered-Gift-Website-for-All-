package com.giftgenius.recommendation.engine;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;

/** Puts a product's matches into words, strongest first, so every recommendation says why. */
@Component
public class ExplanationService {

    public List<String> reasons(ScoredProduct s) {
        return s.matches().stream().map(ExplanationService::reason).filter(Objects::nonNull).toList();
    }

    private static String reason(Match m) {
        return switch (m.signal()) {
            case OCCASION -> "Made for " + occasionLabel(m.value());
            case COMFORTABLY_IN_BUDGET -> "Comfortably within your budget";
            case RECIPIENT -> "A favourite gift for a " + m.value();
            case INTEREST -> "Matches their love of " + m.value();
            case PERSONALITY -> "Suits a " + m.value() + " personality";
            case TOP_RATED -> "One of our highest-rated gifts";
            case WITHIN_BUDGET, OVER_BUDGET, RATING -> null;
        };
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
}
