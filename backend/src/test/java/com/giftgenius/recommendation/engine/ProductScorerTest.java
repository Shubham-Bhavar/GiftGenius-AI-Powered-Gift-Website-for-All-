package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.giftgenius.recommendation.ProductFixture;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

class ProductScorerTest {

    private final ProductScorer scorer = new ProductScorer(RecommendationWeights.defaults());
    private final PreferenceNormalizer normalizer = new PreferenceNormalizer();

    private GiftPreferences prefs(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
        return normalizer.normalize(recipient, occasion, budget, interests, personality);
    }

    private GiftPreferences nothing() {
        return prefs(null, null, null, null, null);
    }

    private ScoredProduct score(ProductFixture p, GiftPreferences prefs) {
        return scorer.score(p.build(), prefs, 0, 0);
    }

    private static Map<Signal, Double> points(ScoredProduct s) {
        Map<Signal, Double> out = new LinkedHashMap<>();
        s.matches().forEach(m -> out.put(m.signal(), m.points()));
        return out;
    }

    private static String value(ScoredProduct s, Signal signal) {
        return s.matches().stream().filter(m -> m.signal() == signal).map(Match::value).findFirst().orElse(null);
    }

    @Test
    void theOccasion() {
        ProductFixture p = product(1).occasions("birthday", "anniversary");
        assertThat(points(score(p, prefs(null, "bday", null, null, null)))).containsEntry(Signal.OCCASION, 30.0);
        assertThat(points(score(p, prefs(null, "graduation", null, null, null)))).doesNotContainKey(Signal.OCCASION);
    }

    @Test
    void theBudget() {
        GiftPreferences budget = prefs(null, null, 1500, null, null);
        assertThat(points(score(product(1).price(1000), budget)))
                .containsEntry(Signal.WITHIN_BUDGET, 25.0).containsEntry(Signal.COMFORTABLY_IN_BUDGET, 10.0);
        assertThat(points(score(product(1).price(1300), budget)))
                .containsEntry(Signal.WITHIN_BUDGET, 25.0).doesNotContainKey(Signal.COMFORTABLY_IN_BUDGET);
        assertThat(points(score(product(1).price(1600), budget)))
                .containsEntry(Signal.OVER_BUDGET, -20.0).doesNotContainKey(Signal.WITHIN_BUDGET);
        assertThat(points(score(product(1).price(1600), nothing())))
                .doesNotContainKeys(Signal.WITHIN_BUDGET, Signal.COMFORTABLY_IN_BUDGET, Signal.OVER_BUDGET);
    }

    @Test
    void theRecipientMatchesTheMostSpecificTagOnce() {
        ScoredProduct both = score(product(1).relationships("parent", "mother"), prefs("mom", null, null, null, null));
        assertThat(value(both, Signal.RECIPIENT)).isEqualTo("mother");
        assertThat(both.matches()).filteredOn(m -> m.signal() == Signal.RECIPIENT).hasSize(1);
        assertThat(points(both)).containsEntry(Signal.RECIPIENT, 20.0);

        assertThat(value(score(product(1).relationships("parent"), prefs("mummy", null, null, null, null)),
                Signal.RECIPIENT)).isEqualTo("parent");
        assertThat(points(score(product(1).relationships("friend"), prefs("mom", null, null, null, null))))
                .doesNotContainKey(Signal.RECIPIENT);
    }

    @Test
    void herOrHimWhenTheRecipientImpliesIt() {
        ProductFixture forHer = product(1).forWhom("her");
        assertThat(points(score(forHer, prefs("sister", null, null, null, null)))).containsEntry(Signal.FOR_WHOM, 6.0);
        assertThat(points(score(forHer, prefs("sibling", null, null, null, null))))
                .doesNotContainKeys(Signal.FOR_WHOM, Signal.NOT_FOR_WHOM);
        assertThat(points(score(product(1).forWhom("her", "him"), prefs("brother", null, null, null, null))))
                .containsEntry(Signal.FOR_WHOM, 6.0);
        assertThat(points(score(product(1), prefs("brother", null, null, null, null))))
                .doesNotContainKeys(Signal.FOR_WHOM, Signal.NOT_FOR_WHOM);
    }

    @Test
    void aGiftMadeOnlyForHerIsPenalisedForABrother() {
        ScoredProduct s = score(product(1).forWhom("her"), prefs("brother", null, null, null, null));
        assertThat(points(s)).containsEntry(Signal.NOT_FOR_WHOM, -25.0).doesNotContainKey(Signal.FOR_WHOM);
        assertThat(s.fits()).isFalse();
    }

    @Test
    void anInterestMatchesTheCategoryOrATagAndCountsOnce() {
        ScoredProduct s = score(product(1).category("accessories").tags("personalized"),
                prefs(null, null, null, List.of("custom", "jewellery"), null));
        assertThat(s.matches()).filteredOn(m -> m.signal() == Signal.INTEREST).hasSize(1);
        assertThat(value(s, Signal.INTEREST)).isEqualTo("personalized");
        assertThat(points(s)).containsEntry(Signal.INTEREST, 15.0);
    }

    @Test
    void premiumOnlyForThoseWhoAskedForLuxury() {
        ProductFixture premium = product(1).tags("premium");
        assertThat(points(score(premium, prefs(null, null, null, null, "luxury")))).containsEntry(Signal.PREMIUM, 8.0);
        assertThat(points(score(premium, prefs(null, null, null, null, "minimalist")))).doesNotContainKey(Signal.PREMIUM);
        assertThat(points(score(product(1), prefs(null, null, null, null, "luxury")))).doesNotContainKey(Signal.PREMIUM);
    }

    @Test
    void festiveAndCulturalProductsForFestivals() {
        assertThat(points(score(product(1).cultural(), prefs(null, "diwali", null, null, null))))
                .containsEntry(Signal.FESTIVE, 12.0);
        assertThat(points(score(product(1).festival(), prefs(null, "festival", null, null, null))))
                .containsEntry(Signal.FESTIVE, 12.0);
        assertThat(points(score(product(1).cultural(), prefs(null, "birthday", null, null, null))))
                .doesNotContainKey(Signal.FESTIVE);
        assertThat(points(score(product(1), prefs(null, "festival", null, null, null))))
                .doesNotContainKey(Signal.FESTIVE);
    }

    @Test
    void popularityIsScaledToTheBestSeller() {
        assertThat(points(scorer.score(product(1).build(), nothing(), 0.5, 0))).containsEntry(Signal.POPULARITY, 4.0);
        assertThat(points(scorer.score(product(1).build(), nothing(), 1.0, 0))).containsEntry(Signal.POPULARITY, 8.0);
        assertThat(points(scorer.score(product(1).build(), nothing(), 0, 0))).doesNotContainKey(Signal.POPULARITY);
    }

    @Test
    void reviewVolumeOnALogScale() {
        assertThat(points(score(product(1).rating(4.5, 0), nothing()))).doesNotContainKey(Signal.REVIEWS);
        assertThat(points(score(product(1).rating(4.5, 22), nothing())).get(Signal.REVIEWS))
                .isCloseTo(4 * Math.log10(23) / Math.log10(501), within(1e-9));
        assertThat(points(score(product(1).rating(4.5, 500), nothing())).get(Signal.REVIEWS)).isCloseTo(4.0, within(1e-9));
        assertThat(points(score(product(1).rating(4.5, 100_000), nothing())).get(Signal.REVIEWS)).isEqualTo(4.0);
    }

    @Test
    void coldStartANewProductIsRatedWithTheNeutralPrior() {
        ScoredProduct s = score(product(1).rating(0, 0), nothing());
        assertThat(scorer.adjustedRating(product(1).rating(0, 0).build())).isCloseTo(4.3, within(1e-9));
        assertThat(points(s).get(Signal.RATING)).isCloseTo(3.0, within(1e-9));
        assertThat(points(s)).containsEntry(Signal.NEW_ARRIVAL, 0.0);
        assertThat(points(score(product(1).rating(4.5, 3), nothing()))).doesNotContainKey(Signal.NEW_ARRIVAL);
    }

    @Test
    void oneFiveStarReviewDoesNotBeatAWellProvenRating() {
        double lucky = score(product(1).rating(5.0, 1), nothing()).score();
        double proven = score(product(2).rating(4.8, 200), nothing()).score();
        assertThat(proven).isGreaterThan(lucky);
    }

    @Test
    void aLowRatingEarnsNothingRatherThanNegativePoints() {
        assertThat(points(score(product(1).rating(3.0, 100), nothing()))).doesNotContainKey(Signal.RATING);
    }

    @Test
    void personalisationIsAddedAsItsOwnSignal() {
        assertThat(points(scorer.score(product(1).build(), nothing(), 0, 5.5))).containsEntry(Signal.PERSONAL, 5.5);
    }

    @Test
    void theScoreIsTheSumOfItsMatchesAndAlwaysTheSame() {
        ProductFixture p = product(1).price(999).occasions("birthday").relationships("friend").category("flowers")
                .personalities("minimalist").rating(4.7, 120);
        GiftPreferences prefs = prefs("bestie", "birthday", 1500, List.of("roses"), "elegant");
        ScoredProduct s = scorer.score(p.build(), prefs, 0.25, 0);
        assertThat(s.score()).isCloseTo(s.matches().stream().mapToDouble(Match::points).sum(), within(1e-9));
        assertThat(s.fits()).isTrue();
        assertThat(scorer.score(p.build(), prefs, 0.25, 0)).isEqualTo(s);
        assertThat(s.matches()).extracting(Match::signal).containsExactly(Signal.OCCASION, Signal.WITHIN_BUDGET,
                Signal.COMFORTABLY_IN_BUDGET, Signal.RECIPIENT, Signal.INTEREST, Signal.PERSONALITY, Signal.POPULARITY,
                Signal.REVIEWS, Signal.RATING);
    }

    @Test
    void qualityAloneIsNotAFit() {
        ScoredProduct s = score(product(1).rating(4.9, 300), nothing());
        assertThat(s.score()).isPositive();
        assertThat(s.fits()).isFalse();
        assertThat(s.quality()).isCloseTo(s.score(), within(1e-9));
    }
}
