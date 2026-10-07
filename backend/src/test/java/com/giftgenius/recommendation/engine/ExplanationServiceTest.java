package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.giftgenius.recommendation.ProductFixture;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Match;
import com.giftgenius.recommendation.model.Recommendation;
import com.giftgenius.recommendation.model.ScoredProduct;
import com.giftgenius.recommendation.model.Signal;

class ExplanationServiceTest {

    private final RecommendationWeights weights = RecommendationWeights.defaults();
    private final ProductScorer scorer = new ProductScorer(weights);
    private final ExplanationService explanations = new ExplanationService(weights);
    private final PreferenceNormalizer normalizer = new PreferenceNormalizer();

    private GiftPreferences prefs(String recipient, String occasion, Integer budget, List<String> interests,
            String personality) {
        return normalizer.normalize(recipient, occasion, budget, interests, personality);
    }

    private String summary(ProductFixture p, GiftPreferences prefs) {
        return explanations.summary(scorer.score(p.build(), prefs, 0, 0), prefs);
    }

    private List<String> reasons(ProductFixture p, GiftPreferences prefs) {
        return explanations.reasons(scorer.score(p.build(), prefs, 0, 0), prefs);
    }

    @Test
    void oneSentenceFromTheStrongestReasons() {
        ProductFixture p = product(1).price(1400).occasions("birthday").category("accessories").tags("personalized");
        assertThat(summary(p, prefs(null, "birthday", 1500, List.of("personalised"), null)))
                .isEqualTo("Made for birthdays, fits your ₹1,500 budget and personalised just for them.");
    }

    @Test
    void theBudgetWordingSaysHowComfortablyItFits() {
        ProductFixture p = product(1).price(999).occasions("birthday").category("accessories").tags("personalized");
        assertThat(summary(p, prefs(null, "birthday", 1500, List.of("personalised"), null)))
                .isEqualTo("Made for birthdays, well within your ₹1,500 budget and personalised just for them.");
    }

    @Test
    void atMostThreeReasonsInTheSentenceButAllInTheList() {
        ProductFixture p = product(1).price(999).occasions("birthday").relationships("friend").category("flowers")
                .personalities("extrovert");
        GiftPreferences prefs = prefs("bestie", "bday", 1500, List.of("roses"), "outgoing");
        assertThat(reasons(p, prefs)).containsExactly("made for birthdays", "well within your ₹1,500 budget",
                "a favourite for friends", "matches their love of flowers", "suits an extrovert personality");
        assertThat(summary(p, prefs))
                .isEqualTo("Made for birthdays, well within your ₹1,500 budget and a favourite for friends.");
    }

    @Test
    void inASetEachSentenceSaysWhatSetsThatPickApart() {
        GiftPreferences prefs = prefs("wife", "anniversary", 5000, List.of("perfume"), null);
        ScoredProduct perfume = scorer.score(product(1).category("fragrance").price(1199).occasions("anniversary")
                .relationships("partner").build(), prefs, 0, 0);
        ScoredProduct photoBook = scorer.score(product(2).category("personalized").price(699).occasions("anniversary")
                .relationships("partner").rating(4.9, 203).build(), prefs, 0, 0);
        ScoredProduct hamper = scorer.score(product(3).price(499).occasions("anniversary").relationships("partner")
                .build(), prefs, 0, 0);

        List<Recommendation> explained = explanations.explain(List.of(perfume, photoBook, hamper), prefs);

        // All three share the occasion, budget and recipient; the occasion leads, then each pick's own reason.
        assertThat(explained).extracting(Recommendation::summary).containsExactly(
                "Made for anniversaries, matches their love of fragrance and well within your ₹5,000 budget.",
                "Made for anniversaries, rated 4.9★ by 203 shoppers and well within your ₹5,000 budget.",
                "Made for anniversaries, well within your ₹5,000 budget and a favourite for partners.");
        // The reasons themselves stay strongest first, and a pick on its own is explained by its strongest three.
        assertThat(explained.get(0).reasons()).containsExactly("made for anniversaries", "well within your ₹5,000 budget",
                "a favourite for partners", "matches their love of fragrance");
        assertThat(explanations.explain(List.of(perfume), prefs).get(0).summary())
                .isEqualTo("Made for anniversaries, well within your ₹5,000 budget and a favourite for partners.");
    }

    @Test
    void aGiftMadeForSomeoneElseIsNeverGivenAsAReason() {
        assertThat(reasons(product(1).forWhom("her"), prefs("brother", null, null, null, null))).isEmpty();
    }

    @Test
    void beingOverBudgetIsAlwaysSaid() {
        ProductFixture p = product(1).price(1100).occasions("birthday");
        assertThat(summary(p, prefs(null, "birthday", 1000, null, null)))
                .isEqualTo("Made for birthdays, just over your ₹1,000 budget.");
    }

    @Test
    void herOrHimOnlyWhenTheRecipientDoesNotAlreadySayIt() {
        assertThat(reasons(product(1).relationships("mother").forWhom("her"), prefs("mom", null, null, null, null)))
                .contains("a favourite for mothers").doesNotContain("picked for her");
        assertThat(reasons(product(1).relationships("friend").forWhom("her"), prefs("sister", null, null, null, null)))
                .containsExactly("picked for her");
    }

    @Test
    void festivePremiumAndInterestWording() {
        ProductFixture p = product(1).occasions("festival").category("cultural").tags("premium").cultural();
        assertThat(summary(p, prefs(null, "diwali", null, List.of("art"), "luxury")))
                .isEqualTo("Made for festive celebrations, matches their love of art and culture and rooted in Indian tradition.");
        assertThat(reasons(product(2).occasions("festival").festival().tags("premium"),
                prefs(null, "holi", null, null, "luxury")))
                .containsExactly("made for festive celebrations", "part of our festive collection", "a premium pick");
    }

    @ParameterizedTest
    @CsvSource({ "luxury, for someone who loves a little luxury", "fun, 'for their fun, creative side'",
            "useful, practical and useful", "elegant, suits a minimalist personality",
            "outgoing, suits an extrovert personality" })
    void personalitiesInTheShoppersWords(String said, String clause) {
        ProductFixture p = product(1).personalities("expressive", "creative", "practical", "minimalist", "extrovert");
        assertThat(reasons(p, prefs(null, null, null, null, said))).containsExactly(clause);
    }

    @Test
    void wellReviewedRatingsAreQuoted() {
        assertThat(summary(product(1).rating(4.9, 182), prefs(null, null, null, null, null)))
                .isEqualTo("Rated 4.9★ by 182 shoppers.");
        assertThat(reasons(product(1).rating(4.4, 182), prefs(null, null, null, null, null))).isEmpty();
        assertThat(reasons(product(1).rating(4.9, 5), prefs(null, null, null, null, null))).isEmpty();
    }

    @Test
    void bestsellersAreCalledOut() {
        GiftPreferences none = prefs(null, null, null, null, null);
        assertThat(explanations.reasons(scorer.score(product(1).build(), none, 1.0, 0), none))
                .contains("a bestseller right now");
        assertThat(explanations.reasons(scorer.score(product(1).build(), none, 0.3, 0), none))
                .doesNotContain("a bestseller right now");
    }

    @Test
    void newProductsSaySo() {
        assertThat(reasons(product(1).rating(0, 0), prefs(null, null, null, null, null)))
                .containsExactly("new in our catalogue");
    }

    @Test
    void theTopRatedFallback() {
        GiftPreferences budget = prefs(null, null, 1000, null, null);
        ScoredProduct top = new ScoredProduct(product(1).build(), 9, List.of(new Match(Signal.TOP_RATED, null, 0)));
        assertThat(explanations.summary(top, budget)).isEqualTo("One of our highest-rated gifts.");
        ScoredProduct over = new ScoredProduct(product(1).build(), 9,
                List.of(new Match(Signal.TOP_RATED, null, 0), new Match(Signal.OVER_BUDGET, null, 0)));
        assertThat(explanations.summary(over, budget))
                .isEqualTo("One of our highest-rated gifts, just over your ₹1,000 budget.");
    }

    @Test
    void nothingToSay() {
        ScoredProduct s = new ScoredProduct(product(1).build(), 2, List.of(new Match(Signal.REVIEWS, null, 2)));
        assertThat(explanations.summary(s, prefs(null, null, null, null, null)))
                .isEqualTo("A thoughtful, highly rated choice.");
    }

    @ParameterizedTest
    @CsvSource({ "festival, festive celebrations", "valentine, Valentine's Day", "anniversary, anniversaries",
            "baby, welcoming a new baby", "retirement, retirement" })
    void occasionLabels(String occasion, String label) {
        assertThat(ExplanationService.occasionLabel(occasion)).isEqualTo(label);
    }

    @ParameterizedTest
    @CsvSource({ "500, ₹500", "1500, '₹1,500'", "99999, '₹99,999'", "150000, '₹1,50,000'",
            "10000000, '₹1,00,00,000'" })
    void indianDigitGrouping(int amount, String formatted) {
        assertThat(ExplanationService.rupees(amount)).isEqualTo(formatted);
    }
}
