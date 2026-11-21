package com.giftgenius.recommendation.engine;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;

/** The avoid list as a hard filter: a family covers its category and its give-away words, nothing more. */
class AvoidListTest {

    private static final ProductDto PERFUME = product(4).name("Signature Perfume").category("fragrance").build();
    private static final ProductDto ATTAR_IN_A_HAMPER = product(30).name("Attar & Sweets Hamper").category("gift sets")
            .build();
    private static final ProductDto TIMEPIECE = product(2).name("Engraved Timepiece").category("accessories")
            .tags("personalized").build();
    private static final ProductDto WALLET = product(15).name("Leather Wallet & Card Holder").category("accessories")
            .build();
    private static final ProductDto JEWELLERY_BOX = product(19).name("Kolhapuri Craft Jewellery Box")
            .category("cultural").build();
    private static final ProductDto ROSES = product(3).name("Classic Roses Bouquet").category("gift sets").build();
    private static final ProductDto CHOCOLATES = product(6).name("Artisan Chocolate Box").category("food & sweets")
            .build();
    private static final List<ProductDto> ALL = List.of(PERFUME, ATTAR_IN_A_HAMPER, TIMEPIECE, WALLET, JEWELLERY_BOX,
            ROSES, CHOCOLATES);

    private static List<ProductDto> leftOut(String... avoid) {
        Set<String> terms = Set.of(avoid);
        return ALL.stream().filter(p -> AvoidList.excludes(terms, p)).toList();
    }

    @Test
    void aFamilyCoversItsCategoryAndTheWordsThatGiveItAway() {
        assertThat(leftOut("perfume")).containsExactly(PERFUME, ATTAR_IN_A_HAMPER);
        assertThat(leftOut("sweets")).containsExactly(ATTAR_IN_A_HAMPER, CHOCOLATES);
        assertThat(leftOut("flowers")).containsExactly(ROSES); // "Roses" read as "rose"
    }

    @Test
    void aSpecificThingLeavesTheRestOfItsCategoryAlone() {
        assertThat(leftOut("watches")).containsExactly(TIMEPIECE); // not the wallet: both are accessories
        assertThat(leftOut("jewellery")).containsExactly(JEWELLERY_BOX);
    }

    @Test
    void tagsCountAndAnyOtherWordIsLookedForInNames() {
        assertThat(leftOut("personalised")).containsExactly(TIMEPIECE);
        assertThat(leftOut("leather")).containsExactly(WALLET);
        assertThat(leftOut("accessories")).containsExactly(TIMEPIECE, WALLET);
        assertThat(leftOut()).isEmpty();
    }

    @Test
    void wordsAreKeptInOneCanonicalForm() {
        assertThat(AvoidList.canonical(" Chocolates ")).isEqualTo("sweets");
        assertThat(AvoidList.canonical("Fragrance")).isEqualTo("perfume");
        assertThat(AvoidList.canonical("jewellery")).isEqualTo("jewellery"); // a known thing, not "accessories"
        assertThat(AvoidList.canonical("decor")).isEqualTo("home decor"); // an interest word stands for its category
        assertThat(AvoidList.canonical("leather")).isEqualTo("leather");
    }

    @Test
    void avoidingAThingRulesOutTheInterestItCovers() {
        assertThat(AvoidList.covers(Set.of("perfume"), "fragrance")).isTrue();
        assertThat(AvoidList.covers(Set.of("sweets"), "food & sweets")).isTrue();
        assertThat(AvoidList.covers(Set.of("watches"), "accessories")).isFalse();
    }
}
