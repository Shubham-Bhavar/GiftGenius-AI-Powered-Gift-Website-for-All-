package com.giftgenius.ai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.giftgenius.catalog.ProductDtos.ProductDto;

/**
 * Deterministic scoring, ported from the original front-end engine so results stay familiar.
 * It is the shortlist for the AI and the fallback whenever the AI is off or fails.
 */
@Component
public class RecommendationEngine {

    /** Items priced above budget × this factor are excluded outright. */
    static final double BUDGET_TOLERANCE = 1.15;

    public record Criteria(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
    }

    public record Scored(ProductDto product, double score, List<String> reasons) {
    }

    public List<Scored> rank(List<ProductDto> catalog, Criteria c, int limit) {
        List<Scored> scored = new ArrayList<>();
        for (ProductDto p : catalog) {
            double score = 0;
            List<String> reasons = new ArrayList<>();
            double price = p.price().doubleValue();

            if (c.occasion() != null && p.occasion().contains(c.occasion())) {
                score += 30;
                reasons.add("Made for " + label(c.occasion()));
            }
            if (c.budget() != null && c.budget() > 0) {
                if (price > c.budget() * BUDGET_TOLERANCE) {
                    continue; // well over budget: never suggest it
                }
                if (price <= c.budget()) {
                    score += 25;
                    if (price <= c.budget() * 0.8) {
                        score += 10;
                        reasons.add("Comfortably within your budget");
                    }
                } else {
                    score -= 20; // slightly over budget: allowed, but ranked lower
                }
            }
            if (c.recipient() != null && p.relationship().contains(c.recipient())) {
                score += 20;
                reasons.add("A favourite gift for a " + c.recipient());
            }
            if (c.interests() != null && c.interests().contains(p.category())) {
                score += 15;
                reasons.add("Matches their love of " + p.category());
            }
            if (c.personality() != null && p.personality().contains(c.personality())) {
                score += 10;
                reasons.add("Suits a " + c.personality() + " personality");
            }
            score += Math.max(0, Math.min((p.rating().doubleValue() - 4.0) * 10, 10));

            if (score > 0) {
                scored.add(new Scored(p, score, reasons));
            }
        }
        scored.sort(Comparator.comparingDouble(Scored::score).reversed()
                .thenComparing(s -> s.product().rating(), Comparator.reverseOrder()));
        return scored.stream().limit(limit).toList();
    }

    public List<Scored> topRated(List<ProductDto> catalog, int limit) {
        return catalog.stream()
                .sorted(Comparator.comparing(ProductDto::rating).reversed()
                        .thenComparing(ProductDto::reviewCount, Comparator.reverseOrder()))
                .limit(limit)
                .map(p -> new Scored(p, 0, List.of("One of our highest-rated gifts")))
                .toList();
    }

    static String normalize(String s) {
        return s == null || s.isBlank() ? null : s.trim().toLowerCase(Locale.ROOT);
    }

    private static String label(String occasion) {
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
