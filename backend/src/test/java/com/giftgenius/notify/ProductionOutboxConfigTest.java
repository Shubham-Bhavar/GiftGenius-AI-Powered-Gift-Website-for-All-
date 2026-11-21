package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.SyncTaskExecutor;

import com.giftgenius.TestProps;
import com.giftgenius.config.AppProperties;

/**
 * The retry schedule as production loads it from application.yml: the one place these numbers are written in a test.
 * Every other test reads the same file through {@link TestProps#outbox()}, so none can drift from it.
 */
class ProductionOutboxConfigTest {

    private final AppProperties.Outbox outbox = TestProps.outbox();

    @Test
    void retriesAfterOneFiveAndFifteenMinutesThenAnHour() {
        assertThat(outbox.retryDelays()).containsExactly(Duration.ofMinutes(1), Duration.ofMinutes(5),
                Duration.ofMinutes(15), Duration.ofHours(1));
    }

    @Test
    void makesAtMostFiveAttempts() {
        EmailOutboxSender sender = new EmailOutboxSender(null, () -> null, new SyncTaskExecutor(), "x@example.com",
                outbox);
        assertThat(sender.maxAttempts()).isEqualTo(5);
        assertThat(sender.delayAfter(1)).isEqualTo(Duration.ofMinutes(1));
        assertThat(sender.delayAfter(4)).isEqualTo(Duration.ofHours(1));
    }

    @Test
    void sendsByDefaultPollsEveryFifteenSecondsAndReservesForFiveMinutes() {
        assertThat(outbox.senderEnabled()).isTrue();
        assertThat(outbox.pollInterval()).isEqualTo(Duration.ofSeconds(15));
        assertThat(outbox.lease()).isEqualTo(Duration.ofMinutes(5));
        assertThat(outbox.batchSize()).isEqualTo(20);
    }

    @Test
    void theLeaseOutlastsTheSlowestPossibleSend() {
        // Each SMTP step is capped at 10 s (spring.mail.properties); a send is a handful of steps. The lease must leave
        // a wide margin, or a slow but successful send would be recorded as interrupted.
        assertThat(outbox.lease()).isGreaterThanOrEqualTo(Duration.ofSeconds(10).multipliedBy(15));
    }
}
