package com.giftgenius.recommendation.engine;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The words shoppers use, and what they mean in the catalogue's vocabulary. Shared by the {@link PreferenceNormalizer}
 * (one answer at a time) and the {@link TextPreferenceParser} (words found in a sentence).
 */
final class Vocabulary {

    /** A recipient word: the catalogue relationship, a more specific one products may carry, and her/him if implied. */
    record Who(String relationship, String specific, String forWhom) {
    }

    static final Map<String, Who> RECIPIENTS = Map.ofEntries(
            Map.entry("mom", new Who("parent", "mother", "her")), Map.entry("mother", new Who("parent", "mother", "her")),
            Map.entry("mummy", new Who("parent", "mother", "her")), Map.entry("mum", new Who("parent", "mother", "her")),
            Map.entry("maa", new Who("parent", "mother", "her")),
            Map.entry("dad", new Who("parent", "father", "him")), Map.entry("father", new Who("parent", "father", "him")),
            Map.entry("papa", new Who("parent", "father", "him")), Map.entry("daddy", new Who("parent", "father", "him")),
            Map.entry("parent", new Who("parent", null, null)), Map.entry("parents", new Who("parent", null, null)),
            Map.entry("brother", new Who("sibling", null, "him")), Map.entry("bro", new Who("sibling", null, "him")),
            Map.entry("sister", new Who("sibling", null, "her")), Map.entry("sis", new Who("sibling", null, "her")),
            Map.entry("sibling", new Who("sibling", null, null)),
            Map.entry("wife", new Who("partner", null, "her")), Map.entry("girlfriend", new Who("partner", null, "her")),
            Map.entry("husband", new Who("partner", null, "him")), Map.entry("boyfriend", new Who("partner", null, "him")),
            Map.entry("partner", new Who("partner", null, null)), Map.entry("spouse", new Who("partner", null, null)),
            Map.entry("friend", new Who("friend", null, null)), Map.entry("best friend", new Who("friend", null, null)),
            Map.entry("bestie", new Who("friend", null, null)),
            Map.entry("colleague", new Who("colleague", null, null)), Map.entry("coworker", new Who("colleague", null, null)),
            Map.entry("boss", new Who("colleague", null, null)), Map.entry("manager", new Who("colleague", null, null)));

    /** Gifts for oneself have no recipient to match. ("me" only as a whole answer: in a sentence it is everywhere.) */
    static final Set<String> SELF = Set.of("self", "myself", "me");

    static final Map<String, String> OCCASIONS = Map.ofEntries(
            Map.entry("bday", "birthday"), Map.entry("wedding", "anniversary"), Map.entry("marriage", "anniversary"),
            Map.entry("engagement", "anniversary"), Map.entry("diwali", "festival"), Map.entry("deepavali", "festival"),
            Map.entry("rakhi", "festival"), Map.entry("raksha bandhan", "festival"), Map.entry("holi", "festival"),
            Map.entry("eid", "festival"), Map.entry("christmas", "festival"), Map.entry("navratri", "festival"),
            Map.entry("pongal", "festival"), Map.entry("onam", "festival"), Map.entry("festive", "festival"),
            Map.entry("valentines", "valentine"), Map.entry("valentine's day", "valentine"),
            Map.entry("convocation", "graduation"), Map.entry("promotion", "achievement"),
            Map.entry("new job", "achievement"), Map.entry("baby shower", "baby"), Map.entry("newborn", "baby"));

    static final Map<String, String> INTERESTS = Map.ofEntries(
            Map.entry("perfume", "fragrance"), Map.entry("perfumes", "fragrance"), Map.entry("scent", "fragrance"),
            Map.entry("flower", "flowers"), Map.entry("roses", "flowers"), Map.entry("bouquet", "flowers"),
            Map.entry("chocolate", "food & sweets"), Map.entry("chocolates", "food & sweets"),
            Map.entry("sweets", "food & sweets"), Map.entry("food", "food & sweets"),
            Map.entry("jewellery", "accessories"), Map.entry("jewelry", "accessories"),
            Map.entry("watches", "accessories"), Map.entry("fashion", "accessories"),
            Map.entry("spa", "wellness"), Map.entry("self-care", "wellness"), Map.entry("yoga", "wellness"),
            Map.entry("decor", "home decor"), Map.entry("home", "home decor"),
            Map.entry("art", "cultural"), Map.entry("culture", "cultural"), Map.entry("traditional", "cultural"),
            Map.entry("handmade", "cultural"),
            Map.entry("custom", "personalized"), Map.entry("customised", "personalized"),
            Map.entry("customized", "personalized"), Map.entry("personalised", "personalized"),
            Map.entry("engraved", "personalized"),
            Map.entry("hamper", "gift sets"), Map.entry("hampers", "gift sets"), Map.entry("gift set", "gift sets"));

    static final Map<String, String> PERSONALITIES = Map.ofEntries(
            Map.entry("luxury", "expressive"), Map.entry("luxurious", "expressive"), Map.entry("premium", "expressive"),
            Map.entry("classy", "expressive"), Map.entry("fun", "creative"), Map.entry("quirky", "creative"),
            Map.entry("artistic", "creative"), Map.entry("minimal", "minimalist"), Map.entry("elegant", "minimalist"),
            Map.entry("simple", "minimalist"), Map.entry("useful", "practical"), Map.entry("outgoing", "extrovert"),
            Map.entry("social", "extrovert"), Map.entry("shy", "introvert"), Map.entry("quiet", "introvert"));

    /** The quiz's "Luxury & Premium" option sends "expressive"; these all mean they want something premium. */
    static final Set<String> PREMIUM_WORDS = Set.of("luxury", "luxurious", "premium", "classy", "expressive");

    /** The catalogue's own terms, which also count when written out in a sentence. */
    static final List<String> OCCASION_NAMES = List.of("birthday", "anniversary", "festival", "graduation", "valentine",
            "achievement", "baby");
    static final List<String> CATEGORIES = List.of("flowers", "fragrance", "accessories", "gift sets", "personalized",
            "food & sweets", "wellness", "home decor", "cultural");
    static final List<String> PERSONALITY_NAMES = List.of("minimalist", "creative", "expressive", "practical",
            "extrovert", "introvert");

    private Vocabulary() {
    }
}
