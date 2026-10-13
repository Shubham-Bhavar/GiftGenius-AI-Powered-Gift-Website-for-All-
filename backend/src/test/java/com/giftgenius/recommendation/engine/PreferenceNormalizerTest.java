package com.giftgenius.recommendation.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.giftgenius.recommendation.model.GiftPreferences;

class PreferenceNormalizerTest {

    private final PreferenceNormalizer normalizer = new PreferenceNormalizer();

    private GiftPreferences recipient(String recipient) {
        return normalizer.normalize(recipient, null, null, null, null);
    }

    @ParameterizedTest
    @ValueSource(strings = { "mom", "Mother", " MUMMY ", "mum", "maa" })
    void motherWordsMeanAParentForHer(String word) {
        GiftPreferences p = recipient(word);
        assertThat(p.recipient()).isEqualTo("parent");
        assertThat(p.recipientTerms()).containsExactly("mother", "parent");
        assertThat(p.forWhom()).isEqualTo("her");
    }

    @ParameterizedTest
    @ValueSource(strings = { "dad", "Father", "papa", "daddy" })
    void fatherWordsMeanAParentForHim(String word) {
        GiftPreferences p = recipient(word);
        assertThat(p.recipient()).isEqualTo("parent");
        assertThat(p.recipientTerms()).containsExactly("father", "parent");
        assertThat(p.forWhom()).isEqualTo("him");
    }

    @ParameterizedTest
    @CsvSource({ "brother, sibling, him", "sister, sibling, her", "wife, partner, her", "husband, partner, him",
            "best friend, friend, ", "coworker, colleague, ", "boss, colleague, " })
    void relationshipWordsMapToTheCatalogueVocabulary(String word, String relationship, String forWhom) {
        GiftPreferences p = recipient(word);
        assertThat(p.recipient()).isEqualTo(relationship);
        assertThat(p.recipientTerms()).containsExactly(relationship);
        assertThat(p.forWhom()).isEqualTo(forWhom);
    }

    @Test
    void catalogueTermsPassThroughWithNoGenderGuess() {
        GiftPreferences p = recipient("parent");
        assertThat(p.recipient()).isEqualTo("parent");
        assertThat(p.recipientTerms()).containsExactly("parent");
        assertThat(p.forWhom()).isNull();
        assertThat(recipient("Neighbour").recipient()).isEqualTo("neighbour");
    }

    @ParameterizedTest
    @ValueSource(strings = { "self", "Myself" })
    void aGiftForOneselfHasNoRecipientToMatch(String word) {
        GiftPreferences p = recipient(word);
        assertThat(p.recipient()).isNull();
        assertThat(p.recipientTerms()).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({ "bday, birthday", "Diwali, festival", "' Raksha Bandhan ', festival", "eid, festival",
            "wedding, anniversary", "convocation, graduation", "promotion, achievement", "newborn, baby",
            "anniversary, anniversary", "retirement, retirement" })
    void occasionWords(String word, String occasion) {
        assertThat(normalizer.normalize(null, word, null, null, null).occasion()).isEqualTo(occasion);
    }

    @Test
    void interestsAreMappedDeduplicatedAndBlanksDropped() {
        GiftPreferences p = normalizer.normalize(null, null, null,
                Arrays.asList("Perfume", "fragrance", " ", null, "chocolates", "custom", "Home"), null);
        assertThat(p.interests()).containsExactly("fragrance", "food & sweets", "personalized", "home decor");
        assertThat(normalizer.normalize(null, null, null, null, null).interests()).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({ "luxury, expressive, true", "Expressive, expressive, true", "premium, expressive, true",
            "fun, creative, false", "elegant, minimalist, false", "shy, introvert, false",
            "practical, practical, false" })
    void personalityWordsAndThePremiumWish(String word, String personality, boolean premium) {
        GiftPreferences p = normalizer.normalize(null, null, null, null, word);
        assertThat(p.personality()).isEqualTo(personality);
        assertThat(p.premium()).isEqualTo(premium);
    }

    @Test
    void unansweredQuestionsStayEmpty() {
        GiftPreferences p = normalizer.normalize(" ", "", null, List.of(), null);
        assertThat(p.recipient()).isNull();
        assertThat(p.occasion()).isNull();
        assertThat(p.personality()).isNull();
        assertThat(p.premium()).isFalse();
        assertThat(p.hasBudget()).isFalse();
    }

    @Test
    void aZeroBudgetIsFlexible() {
        assertThat(normalizer.normalize(null, null, 0, null, null).hasBudget()).isFalse();
        assertThat(normalizer.normalize(null, null, 1500, null, null).hasBudget()).isTrue();
    }

    @Test
    void termTrimsAndLowerCases() {
        assertThat(normalizer.term("  Birthday ")).isEqualTo("birthday");
        assertThat(normalizer.term("   ")).isNull();
        assertThat(normalizer.term(null)).isNull();
    }
}
