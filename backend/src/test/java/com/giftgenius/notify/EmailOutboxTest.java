package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** Queueing refusals that never reach the database, and the failure counter (the database cases are in EmailOutboxIT). */
class EmailOutboxTest {

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final EmailOutbox outbox = new EmailOutbox(null, e -> { }, meters);

    private double failures(String reason) {
        var counter = meters.find("giftgenius.email.queue.failures").tag("reason", reason).counter();
        return counter == null ? 0 : counter.count();
    }

    @Test
    void anEmailWithNoUsableRecipientIsRefusedAndCounted() {
        assertThat(outbox.enqueue("order:1:confirmed:customer", EmailKind.ORDER_CONFIRMED, 1L, " ", "S", "B")).isFalse();
        assertThat(outbox.enqueue("order:1:confirmed:customer", EmailKind.ORDER_CONFIRMED, 1L, "no-at-sign", "S", "B"))
                .isFalse();
        assertThat(failures("no_recipient")).isEqualTo(2);
    }

    @Test
    void anInvalidKeyIsRefusedAndCounted() {
        assertThat(outbox.enqueue("", EmailKind.ORDER_CONFIRMED, 1L, "a@example.com", "S", "B")).isFalse();
        assertThat(outbox.enqueue("k".repeat(EmailOutbox.MAX_KEY + 1), EmailKind.ORDER_CONFIRMED, 1L, "a@example.com",
                "S", "B")).isFalse();
        assertThat(failures("invalid_key")).isEqualTo(2);
    }

    @Test
    void theCounterCarriesTheReasonOnlyNoCustomerData() {
        outbox.countFailure(EmailOutbox.Failure.CONTENT);
        var counter = meters.find("giftgenius.email.queue.failures").counter();
        assertThat(counter).isNotNull();
        assertThat(counter.getId().getTags()).extracting(t -> t.getKey()).containsExactly("reason");
        assertThat(failures("content")).isEqualTo(1);
    }
}
