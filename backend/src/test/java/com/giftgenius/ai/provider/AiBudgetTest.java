package com.giftgenius.ai.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class AiBudgetTest {

    /** A clock the test moves by hand. */
    static final class TestClock extends Clock {
        private Instant now;

        TestClock(String start) {
            this.now = Instant.parse(start);
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final TestClock clock = new TestClock("2026-10-07T23:50:00Z");

    @Test
    void atMostTheDailyLimit() {
        AiBudget budget = new AiBudget(2, Duration.ofMinutes(5), clock);
        assertThat(budget.tryAcquire()).isTrue();
        assertThat(budget.hasRoom()).isTrue();
        assertThat(budget.tryAcquire()).isTrue();
        assertThat(budget.hasRoom()).isFalse();
        assertThat(budget.tryAcquire()).isFalse();
    }

    @Test
    void aNewDayBringsANewBudget() {
        AiBudget budget = new AiBudget(1, Duration.ofMinutes(5), clock);
        assertThat(budget.tryAcquire()).isTrue();
        assertThat(budget.tryAcquire()).isFalse();
        clock.advance(Duration.ofMinutes(15)); // past midnight UTC
        assertThat(budget.tryAcquire()).isTrue();
    }

    @Test
    void aQuotaErrorPausesCallsForTheCooldown() {
        AiBudget budget = new AiBudget(100, Duration.ofMinutes(5), clock);
        budget.pause();
        assertThat(budget.hasRoom()).isFalse();
        assertThat(budget.tryAcquire()).isFalse();
        clock.advance(Duration.ofMinutes(4));
        assertThat(budget.hasRoom()).isFalse();
        clock.advance(Duration.ofMinutes(1));
        assertThat(budget.tryAcquire()).isTrue();
    }

    @Test
    void aZeroLimitMeansNoCalls() {
        assertThat(new AiBudget(0, Duration.ofMinutes(5), clock).tryAcquire()).isFalse();
    }
}
