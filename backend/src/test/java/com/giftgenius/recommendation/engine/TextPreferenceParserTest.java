package com.giftgenius.recommendation.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.giftgenius.recommendation.engine.TextPreferenceParser.Parsed;

class TextPreferenceParserTest {

    private final TextPreferenceParser parser = new TextPreferenceParser();

    @Test
    void aTypicalRequest() {
        assertThat(parser.parse("A birthday gift for my mom under ₹1,500, she loves perfume"))
                .isEqualTo(new Parsed("mom", "birthday", 1500, List.of("fragrance"), null));
    }

    @Test
    void festivalsRelationsAndRupeeWords() {
        assertThat(parser.parse("Something for my brother for Rakhi, budget 1000 rupees"))
                .isEqualTo(new Parsed("brother", "rakhi", 1000, List.of(), null));
        assertThat(parser.parse("Diwali hamper for my boss, 2k"))
                .isEqualTo(new Parsed("boss", "diwali", 2000, List.of("gift sets"), null));
    }

    @Test
    void severalInterestsInTheOrderMentionedAtMostThree() {
        assertThat(parser.parse("My wife’s anniversary. She likes chocolates and roses. Around 2.5k.")).isEqualTo(
                new Parsed("wife", "anniversary", 2500, List.of("food & sweets", "flowers"), null));
        assertThat(parser.parse("flowers, perfume, chocolates, spa and art").interests())
                .containsExactly("flowers", "fragrance", "food & sweets");
        assertThat(parser.parse("a hamper or a gift set, maybe home decor for her new home").interests())
                .containsExactly("gift sets", "home decor");
    }

    @Test
    void wholeWordsOnlyAndTheLongerPhraseWins() {
        assertThat(parser.parse("my best friend's bday, max rs.800, something fun"))
                .isEqualTo(new Parsed("best friend", "bday", 800, List.of(), "fun"));
        assertThat(parser.parse("a gift for my girlfriend").recipient()).isEqualTo("girlfriend");
        assertThat(parser.parse("a holiday gift for my daddy").occasion()).isNull();
        assertThat(parser.parse("a holiday gift for my daddy").recipient()).isEqualTo("daddy");
        assertThat(parser.parse("she loves to watch movies at a party").interests()).isEmpty();
        assertThat(parser.parse("something for myself").recipient()).isEqualTo("myself");
    }

    @Test
    void numbersWithoutARupeeSignOrBudgetWordAreNotABudget() {
        assertThat(parser.parse("a gift for my sister who is turning 30").budget()).isNull();
        assertThat(parser.parse("2 gifts for my 3 colleagues").budget()).isNull();
    }

    @ParameterizedTest
    @CsvSource({ "'under ₹50', 50", "'1500/-', 1500", "'INR 3,000', 3000", "'below 999', 999",
            "'up to Rs 1,25,000', 125000", "'₹20,00,000', ", "'budget of 0', " })
    void budgets(String text, Integer budget) {
        assertThat(parser.parse(text).budget()).isEqualTo(budget);
    }

    @Test
    void nothingToReadIsNothingAnswered() {
        Parsed none = new Parsed(null, null, null, List.of(), null);
        assertThat(parser.parse("   ")).isEqualTo(none);
        assertThat(parser.parse(null)).isEqualTo(none);
        assertThat(parser.parse("Help me find something nice")).isEqualTo(none);
    }
}
