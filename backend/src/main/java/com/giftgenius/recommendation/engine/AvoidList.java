package com.giftgenius.recommendation.engine;

import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.engine.Vocabulary.Avoid;

/**
 * What the recipient doesn't like or already has, as a hard filter: a product is left out when one of those things
 * is its category, one of its tags, or a word in its name. Known things cover their whole family ("perfume" also
 * leaves out the fragrance category, "sweets" a chocolate box; see {@link Vocabulary#AVOID}); any other word rules out
 * products with it in their name, category or tags, so "leather" leaves out a leather wallet.
 */
final class AvoidList {

    private AvoidList() {
    }

    /**
     * The word as the avoid list keeps it: "Chocolates" → "sweets", an interest word → its category ("decor" →
     * "home decor"), anything else lower-cased. A known thing is checked before interests, so "jewellery" means
     * jewellery, not every accessory.
     */
    static String canonical(String term) {
        String t = term.trim().toLowerCase(Locale.ROOT);
        if (Vocabulary.AVOID.containsKey(t)) {
            return t;
        }
        String known = Vocabulary.AVOID_WORDS.get(t);
        return known != null ? known : Vocabulary.INTERESTS.getOrDefault(t, t);
    }

    /** Whether any of these (canonical) things rules the product out. */
    static boolean excludes(Collection<String> avoid, ProductDto p) {
        if (avoid.isEmpty()) {
            return false;
        }
        String name = " " + String.join(" ", words(p.name())) + " ";
        return avoid.stream().anyMatch(term -> {
            Avoid family = family(term);
            return family.categories().contains(p.category())
                    || p.tags().stream().anyMatch(family.tags()::contains)
                    || family.nameWords().stream().anyMatch(w -> name.contains(" " + String.join(" ", words(w)) + " "));
        });
    }

    /** Whether avoiding these rules out a whole interest (avoiding perfume rules out "fragrance"). */
    static boolean covers(Collection<String> avoid, String interest) {
        return avoid.stream().anyMatch(term -> term.equals(interest) || family(term).categories().contains(interest));
    }

    private static Avoid family(String term) {
        Avoid known = Vocabulary.AVOID.get(term);
        return known != null ? known : new Avoid(Set.of(term), Set.of(term), Set.of(term));
    }

    /** Lower-case words, singular ("Roses" → "rose", "Watches" → "watch", "Boxes" → "box"). */
    private static Set<String> words(String text) {
        return Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .filter(w -> !w.isEmpty()).map(AvoidList::singular)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static String singular(String w) {
        if (w.length() > 4 && w.endsWith("es") && w.substring(0, w.length() - 2).matches(".*(ch|sh|x|ss)")) {
            return w.substring(0, w.length() - 2);
        }
        return w.length() > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.substring(0, w.length() - 1) : w;
    }
}
