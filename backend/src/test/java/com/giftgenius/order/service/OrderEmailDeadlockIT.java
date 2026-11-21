package com.giftgenius.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.test.util.ReflectionTestUtils;

import com.giftgenius.it.AbstractIT;
import com.giftgenius.notify.EmailKind;
import com.giftgenius.notify.EmailOutbox;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * GG-28: when queueing an order email meets a deadlock (MySQL has then rolled back the whole order transaction), the
 * order is not reported as placed. The request fails with a retryable 409 and nothing of the order remains: no order,
 * no reserved stock, no queued email, and the cart is as it was. Retrying once the conflict has passed places it.
 *
 * <p>The customer's and sellers' emails are queued for real before the owner's email meets the deadlock, so this also
 * shows that emails queued earlier in the same transaction go with it.
 */
class OrderEmailDeadlockIT extends AbstractIT {

    @Autowired
    private OrderNotifier notifier;

    private EmailOutbox realOutbox;
    private final AtomicBoolean deadlockOnOwnersEmail = new AtomicBoolean(true);

    @BeforeEach
    void deadlockTheOwnersEmail() {
        realOutbox = (EmailOutbox) ReflectionTestUtils.getField(notifier, "outbox");
        EmailOutbox real = realOutbox;
        EmailOutbox flaky = new EmailOutbox(db, e -> { }, new SimpleMeterRegistry()) {
            @Override
            public boolean enqueue(String dedupeKey, EmailKind kind, Long orderId, String to, String subject,
                    String body, String html) {
                if (kind == EmailKind.ORDER_NEW_FOR_OWNER && deadlockOnOwnersEmail.get()) {
                    // What Spring makes of MySQL error 1213, as EmailOutbox passes it on.
                    throw new CannotAcquireLockException("Deadlock found when trying to get lock",
                            new java.sql.SQLTransactionRollbackException("Deadlock found", "40001", 1213));
                }
                return real.enqueue(dedupeKey, kind, orderId, to, subject, body, html);
            }
        };
        ReflectionTestUtils.setField(notifier, "outbox", flaky);
    }

    @AfterEach
    void restore() {
        ReflectionTestUtils.setField(notifier, "outbox", realOutbox);
    }

    @Test
    void anOrderWhoseEmailMeetsADeadlockIsNotPlacedAndCanBeRetried() throws Exception {
        Session s = register(uniqueEmail("deadlock"));
        addToCart(s, 1, 2);
        int stockBefore = stockOf(1);
        Map<String, Object> order = Map.of("shipping", shipping(s.email()), "deliveryType", "STANDARD",
                "paymentMethod", "COD");

        mvc.perform(s.auth(postJson("/api/orders", order)).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("We were busy with another request for you. Please try again."));

        assertThat(db.queryForObject("SELECT COUNT(*) FROM orders WHERE user_id = ?", Integer.class, s.userId()))
                .as("no order saved").isZero();
        assertThat(stockOf(1)).as("no stock held").isEqualTo(stockBefore);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox WHERE recipient = ?", Integer.class,
                s.email())).as("the customer's confirmation, queued before the deadlock, went with it").isZero();
        assertThat(db.queryForObject("""
                SELECT COALESCE(SUM(ci.quantity), 0) FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
                WHERE c.user_id = ?""", Integer.class, s.userId())).as("the cart is as it was").isEqualTo(2);

        deadlockOnOwnersEmail.set(false);
        String number = body(mvc.perform(s.auth(postJson("/api/orders", order))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn())
                .path("orderNumber").asString();
        assertThat(stockOf(1)).isEqualTo(stockBefore - 2);
        assertThat(queuedEmails(number, EmailKind.ORDER_CONFIRMED.name())).hasSize(1);
        assertThat(queuedEmails(number, EmailKind.ORDER_NEW_FOR_OWNER.name())).isNotEmpty();
    }
}
