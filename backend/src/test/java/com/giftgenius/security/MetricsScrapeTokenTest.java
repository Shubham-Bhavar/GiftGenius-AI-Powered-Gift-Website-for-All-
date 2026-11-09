package com.giftgenius.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class MetricsScrapeTokenTest {

    /** Generated per run: a test value, never a real token. */
    private static final String TOKEN = "unit-" + UUID.randomUUID() + UUID.randomUUID();
    private final MetricsScrapeToken token = new MetricsScrapeToken(TOKEN);

    @Test
    void theRightBearerTokenMatches() {
        assertThat(token.configured()).isTrue();
        assertThat(token.matches("Bearer " + TOKEN)).isTrue();
        assertThat(token.matches("bearer " + TOKEN)).as("the scheme is case-insensitive").isTrue();
        assertThat(token.matches("  Bearer   " + TOKEN + "  ")).as("surrounding spaces").isTrue();
    }

    @Test
    void anythingElseIsRefused() {
        assertThat(token.matches(null)).as("no header").isFalse();
        assertThat(token.matches("")).as("empty header").isFalse();
        assertThat(token.matches("Bearer")).as("scheme only").isFalse();
        assertThat(token.matches("Bearer ")).as("empty bearer").isFalse();
        assertThat(token.matches("Bearer    ")).as("blank bearer").isFalse();
        assertThat(token.matches(TOKEN)).as("no scheme").isFalse();
        assertThat(token.matches("Basic " + TOKEN)).as("another scheme").isFalse();
        assertThat(token.matches("Bearer " + TOKEN + "x")).as("longer").isFalse();
        assertThat(token.matches("Bearer " + TOKEN.substring(0, TOKEN.length() - 1))).as("a prefix").isFalse();
        assertThat(token.matches("Bearer " + TOKEN.toUpperCase())).as("case matters in the token").isFalse();
        assertThat(token.matches("Bearer wrong")).isFalse();
    }

    @Test
    void withNoTokenConfiguredNothingMatches() {
        for (String configured : new String[] { null, "", "   " }) {
            MetricsScrapeToken none = new MetricsScrapeToken(configured);
            assertThat(none.configured()).isFalse();
            assertThat(none.matches("Bearer ")).isFalse();
            assertThat(none.matches("Bearer " + configured)).isFalse();
            assertThat(none.matches("Bearer " + TOKEN)).isFalse();
        }
    }

    @Test
    void aConfiguredTokenIsTrimmedAndAShortOneIsFlagged() {
        assertThat(new MetricsScrapeToken("  " + TOKEN + "\n").matches("Bearer " + TOKEN)).isTrue();
        assertThat(token.shorterThanRecommended()).isFalse();
        assertThat(new MetricsScrapeToken("short-but-set").shorterThanRecommended()).isTrue();
        assertThat(new MetricsScrapeToken("short-but-set").matches("Bearer short-but-set")).as("still works").isTrue();
    }
}
