package com.giftgenius.giftbox;

import static com.giftgenius.recommendation.ProductFixture.product;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.giftgenius.catalog.dto.ProductDtos.ProductDto;
import com.giftgenius.giftbox.GiftBoxDtos.BoxCheck;

/** Each compatibility dimension comes from product attributes by a rule that can be read off the text. */
class BoxCompatibilityTest {

    private static final ProductDto MUG = product(1).name("Photo Mug").category("personalized").price(399)
            .occasions("birthday").personalities("creative", "minimalist").forWhom("her", "him").build();
    private static final ProductDto CHOCOLATES = product(2).name("Chocolate Box").category("food & sweets").price(299)
            .occasions("birthday", "festival").personalities("creative", "extrovert").build();
    private static final ProductDto WALLET = product(3).name("Leather Wallet").category("accessories").price(749)
            .occasions("anniversary").personalities("practical").forWhom("him").build();
    private static final ProductDto TRUFFLES = product(4).name("Truffle Tin").category("food & sweets").price(349)
            .occasions("birthday").personalities("creative").build();
    private static final ProductDto WATCH = product(5).name("Smart Watch").category("accessories").price(4999)
            .occasions("birthday").personalities("creative").build();

    private static BoxCheck dimension(List<BoxCheck> checks, String dimension) {
        return checks.stream().filter(c -> c.dimension().equals(dimension)).findFirst().orElse(null);
    }

    @Test
    void aBoxThatGoesTogetherSaysSoOnEveryDimension() {
        List<BoxCheck> checks = BoxCompatibility.check(List.of(MUG, CHOCOLATES), 1000, "birthday", null);
        assertThat(checks).containsExactly(
                new BoxCheck("occasion", "good", "Both are made for birthdays"),
                new BoxCheck("price", "good", "₹698 of your ₹1,000 budget (₹302 to spare)"),
                new BoxCheck("style", "good", "Both suit a fun, creative style"),
                new BoxCheck("variety", "good", "Each gift is a different kind"),
                new BoxCheck("packaging", "unknown",
                        "Packaging fit isn't checked yet: the catalogue doesn't record product sizes"));
    }

    @Test
    void whatDoesntFitIsNamed() {
        List<BoxCheck> checks = BoxCompatibility.check(List.of(MUG, CHOCOLATES, WALLET, TRUFFLES), 1500, "birthday",
                "her");
        assertThat(dimension(checks, "occasion")).isEqualTo(
                new BoxCheck("occasion", "warn", "3 of 4 are made for birthdays; the Leather Wallet isn't"));
        assertThat(dimension(checks, "price")).isEqualTo(
                new BoxCheck("price", "bad", "₹1,796: ₹296 over your ₹1,500 budget"));
        assertThat(dimension(checks, "style")).isEqualTo(
                new BoxCheck("style", "warn", "Mixed styles: no one style runs through all of them"));
        assertThat(dimension(checks, "variety")).isEqualTo(new BoxCheck("variety", "warn",
                "2 food & sweets gifts (the Chocolate Box and the Truffle Tin): swap one for variety"));
        assertThat(dimension(checks, "recipient")).isEqualTo(
                new BoxCheck("recipient", "warn", "Usually chosen for him: the Leather Wallet"));
    }

    @Test
    void oneGiftTakingMostOfTheBudgetIsPointedOut() {
        List<BoxCheck> checks = BoxCompatibility.check(List.of(WATCH, CHOCOLATES), null, null, null);
        assertThat(dimension(checks, "balance")).isEqualTo(new BoxCheck("balance", "info",
                "Most of the box is the Smart Watch (94%); the other is a small extra"));
        assertThat(dimension(checks, "price")).isEqualTo(new BoxCheck("price", "info", "Total ₹5,298"));
        assertThat(dimension(checks, "occasion")).isEqualTo(new BoxCheck("occasion", "info", "Together they suit birthdays"));
    }

    @Test
    void oneGiftOrNoneHasLittleToCompare() {
        assertThat(BoxCompatibility.check(List.of(), 1000, "birthday", null)).isEmpty();
        assertThat(BoxCompatibility.check(List.of(WALLET), 749, "birthday", null)).extracting(BoxCheck::text)
                .containsExactly("Not made especially for birthdays", "₹749 of your ₹749 budget",
                        "Packaging fit isn't checked yet: the catalogue doesn't record product sizes");
    }
}
