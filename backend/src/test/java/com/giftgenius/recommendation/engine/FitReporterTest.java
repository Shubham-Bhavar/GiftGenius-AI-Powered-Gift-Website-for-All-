package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.recommendation.model.FitCheck;
import com.giftgenius.recommendation.model.GiftPreferences;

/** The match counts only what the shopper asked for, weighted like the ranking, and says each answer in words. */
class FitReporterTest {

    private final RecommendationWeights weights = RecommendationWeights.defaults();
    private final ProductScorer scorer = new ProductScorer(weights);
    private final FitReporter fits = new FitReporter(weights);
    private final PreferenceNormalizer normalizer = new PreferenceNormalizer();

    private FitReporter.Report report(ProductDto p, GiftPreferences prefs) {
        return fits.report(scorer.score(p, prefs, 0, 0), prefs);
    }

    private static final ProductDto PLANT_SET = product(8).name("Succulent Plant Gift Set").category("home decor")
            .price(449).occasions("birthday").relationships("partner").personalities("minimalist").build();

    @Test
    void aGiftThatMeetsEverythingIsAFullMatchWithACheckPerAnswer() {
        GiftPreferences prefs = normalizer.normalize("partner", "birthday", 1000, List.of("plants"), "minimalist");
        FitReporter.Report r = report(PLANT_SET, prefs);

        assertThat(r.match()).isEqualTo(100);
        assertThat(r.checks()).containsExactly(
                new FitCheck("interest", true, "Matches their love of home decor"),
                new FitCheck("budget", true, "₹449: well within your ₹1,000 budget"),
                new FitCheck("occasion", true, "Made for birthdays"),
                new FitCheck("recipient", true, "A favourite for partners"),
                new FitCheck("style", true, "Suits a minimalist personality"));
    }

    @Test
    void eachUnmetAnswerLowersTheMatchByItsWeight() {
        // Interest 15 + budget 35 + occasion 30 + recipient 20 + style 10 = 110 possible; style missed.
        GiftPreferences prefs = normalizer.normalize("partner", "birthday", 1000, List.of("plants"), "practical");
        FitReporter.Report r = report(PLANT_SET, prefs);
        assertThat(r.match()).isEqualTo(91); // 100 of 110
        assertThat(r.checks()).contains(new FitCheck("style", false, "Not especially practical"));

        // Just inside the budget (not comfortably): 25 of the budget's 35.
        ProductDto pricier = product(9).category("home decor").price(950).occasions("birthday").build();
        GiftPreferences budgetOnly = normalizer.normalize(null, "birthday", 1000, List.of(), null);
        assertThat(report(pricier, budgetOnly).match()).isEqualTo(85); // 55 of 65
    }

    @Test
    void overBudgetIsSaidWithTheAmountAndCountsAsUnmet() {
        ProductDto over = product(10).category("wellness").price(1099).build();
        FitReporter.Report r = report(over, normalizer.normalize(null, null, 1000, List.of(), null));
        assertThat(r.match()).isZero();
        assertThat(r.checks()).containsExactly(new FitCheck("budget", false, "₹1,099: ₹99 over your ₹1,000 budget"));
    }

    @Test
    void aGiftUsuallyChosenForTheOtherOneIsFlagged() {
        ProductDto forHim = product(14).category("gift sets").forWhom("him").relationships("sibling").build();
        FitReporter.Report r = report(forHim, normalizer.normalize("sister", null, null, List.of(), null));
        assertThat(r.checks()).containsExactly(new FitCheck("recipient", false, "Usually chosen for him"));
        assertThat(r.match()).isEqualTo(77); // the relationship (20) without the her/him fit (6)
    }

    @Test
    void theAvoidListIsConfirmedAndNothingAskedMeansNoPercentage() {
        GiftPreferences avoidOnly = normalizer.normalize(null, null, null, List.of(), null,
                List.of("Perfume", "watch"));
        FitReporter.Report r = report(PLANT_SET, avoidOnly);
        assertThat(r.match()).isNull();
        assertThat(r.checks()).containsExactly(new FitCheck("avoid", true, "Steers clear of perfume and watches"));

        assertThat(report(PLANT_SET, normalizer.normalize(null, null, null, List.of(), null)).checks()).isEmpty();
    }
}
