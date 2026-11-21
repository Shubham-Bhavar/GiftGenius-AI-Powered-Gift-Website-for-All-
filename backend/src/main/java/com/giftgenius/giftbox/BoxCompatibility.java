package com.giftgenius.giftbox;

import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.giftbox.GiftBoxDtos.BoxCheck;
import com.giftgenius.recommendation.engine.ExplanationService;

/**
 * How well gifts go together in one box, worked out from their catalogue attributes by explicit rules: the occasions
 * they're made for, their prices against the budget, the styles they share, whether two are the same kind of gift and
 * who they're usually chosen for. Each dimension gets a plain status and a sentence; there's deliberately no overall
 * percentage. Packaging fit is reported as unknown because the catalogue doesn't record product sizes yet.
 */
final class BoxCompatibility {

    static final String GOOD = "good";
    static final String WARN = "warn";
    static final String BAD = "bad";
    static final String INFO = "info";
    static final String UNKNOWN = "unknown";

    /** One gift making up at least this share of the box is pointed out (the rest are small extras). */
    static final double DOMINANT_SHARE = 0.7;

    /** Personality tags in the shopper's words. */
    private static final Map<String, String> STYLE = Map.of("minimalist", "minimalist", "expressive", "luxurious",
            "creative", "fun, creative", "practical", "practical", "extrovert", "outgoing", "introvert", "low-key");

    private BoxCompatibility() {
    }

    static int total(Collection<ProductDto> items) {
        return items.stream().mapToInt(BoxCompatibility::price).sum();
    }

    /**
     * @param budget   rupees, or null when none was set
     * @param occasion the catalogue's occasion (e.g. "birthday"), or null
     * @param forWhom  "her" or "him" when the recipient implies it, or null
     */
    static List<BoxCheck> check(List<ProductDto> items, Integer budget, String occasion, String forWhom) {
        List<BoxCheck> out = new ArrayList<>();
        if (items.isEmpty()) {
            return out;
        }
        int total = total(items);
        int count = items.size();

        if (occasion != null) {
            String label = ExplanationService.occasionLabel(occasion);
            List<ProductDto> notFor = items.stream().filter(p -> !p.occasion().contains(occasion)).toList();
            if (notFor.isEmpty()) {
                out.add(new BoxCheck("occasion", GOOD, (count == 1 ? "Made for " : all(count) + " are made for ")
                        + label));
            } else if (notFor.size() == count) {
                out.add(new BoxCheck("occasion", BAD, (count == 1 ? "Not made especially for " : "None of them is made especially for ")
                        + label));
            } else {
                out.add(new BoxCheck("occasion", WARN, (count - notFor.size()) + " of " + count + " are made for " + label
                        + "; " + names(notFor) + (notFor.size() == 1 ? " isn't" : " aren't")));
            }
        } else if (count > 1) {
            Set<String> shared = shared(items.stream().map(ProductDto::occasion).toList());
            if (!shared.isEmpty()) {
                out.add(new BoxCheck("occasion", INFO, "Together they suit "
                        + ExplanationService.joinNaturally(shared.stream().map(ExplanationService::occasionLabel).toList())));
            }
        }

        if (budget != null) {
            String theirs = ExplanationService.rupees(budget) + " budget";
            if (total <= budget) {
                int spare = budget - total;
                out.add(new BoxCheck("price", GOOD, ExplanationService.rupees(total) + " of your " + theirs
                        + (spare == 0 ? "" : " (" + ExplanationService.rupees(spare) + " to spare)")));
            } else {
                out.add(new BoxCheck("price", BAD, ExplanationService.rupees(total) + ": "
                        + ExplanationService.rupees(total - budget) + " over your " + theirs));
            }
        } else {
            out.add(new BoxCheck("price", INFO, "Total " + ExplanationService.rupees(total)));
        }

        if (count > 1) {
            ProductDto top = items.stream().max(Comparator.comparingInt(BoxCompatibility::price)).orElseThrow();
            if (total > 0 && price(top) >= DOMINANT_SHARE * total) {
                out.add(new BoxCheck("balance", INFO, "Most of the box is the " + top.name() + " ("
                        + Math.round(100.0 * price(top) / total) + "%); "
                        + (count == 2 ? "the other is a small extra" : "the rest are small extras")));
            }

            Set<String> styles = shared(items.stream().map(ProductDto::personality).toList());
            out.add(styles.isEmpty()
                    ? new BoxCheck("style", WARN, "Mixed styles: no one style runs through all of them")
                    : new BoxCheck("style", GOOD, all(count) + " suit a " + ExplanationService.joinNaturally(
                            styles.stream().map(s -> STYLE.getOrDefault(s, s)).toList()) + " style"));

            Map<String, List<ProductDto>> byCategory = new LinkedHashMap<>();
            items.forEach(p -> byCategory.computeIfAbsent(p.category(), c -> new ArrayList<>()).add(p));
            List<String> repeats = byCategory.entrySet().stream().filter(e -> e.getValue().size() > 1)
                    .map(e -> e.getValue().size() + " " + e.getKey() + " gifts (" + names(e.getValue()) + ")").toList();
            out.add(repeats.isEmpty()
                    ? new BoxCheck("variety", GOOD, "Each gift is a different kind")
                    : new BoxCheck("variety", WARN, ExplanationService.joinNaturally(repeats) + ": swap one for variety"));
        }

        if (forWhom != null) {
            List<ProductDto> forOther = items.stream()
                    .filter(p -> !p.forWhom().isEmpty() && !p.forWhom().contains(forWhom)).toList();
            if (!forOther.isEmpty()) {
                out.add(new BoxCheck("recipient", WARN, "Usually chosen for " + ("her".equals(forWhom) ? "him" : "her")
                        + ": " + names(forOther)));
            }
        }

        out.add(new BoxCheck("packaging", UNKNOWN,
                "Packaging fit isn't checked yet: the catalogue doesn't record product sizes"));
        return out;
    }

    /** "Both" or "All 3". */
    private static String all(int count) {
        return count == 2 ? "Both" : "All " + count;
    }

    private static int price(ProductDto p) {
        return p.price().setScale(0, RoundingMode.HALF_UP).intValue();
    }

    /** Values every list has. */
    private static Set<String> shared(List<List<String>> lists) {
        Set<String> out = new LinkedHashSet<>(lists.get(0));
        lists.forEach(out::retainAll);
        return out;
    }

    private static String names(List<ProductDto> items) {
        return ExplanationService.joinNaturally(items.stream().map(p -> "the " + p.name()).toList());
    }
}
