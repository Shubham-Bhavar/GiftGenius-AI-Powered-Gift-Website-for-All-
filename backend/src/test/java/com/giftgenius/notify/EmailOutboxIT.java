package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.giftgenius.TestProps;
import com.giftgenius.config.AppProperties;
import com.giftgenius.it.AbstractIT;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import tools.jackson.databind.JsonNode;

/**
 * The email outbox against real MySQL: one copy per key however it's queued, queueing that can't undo an order, and
 * senders (several at once, a failing provider, none configured, one interrupted) that send each email at most once
 * and record exactly what happened.
 */
@Timeout(value = 60, threadMode = Timeout.ThreadMode.SEPARATE_THREAD) // a runaway sender fails, not hangs
class EmailOutboxIT extends AbstractIT {

    @Autowired
    private EmailOutbox outbox;

    @Autowired
    private EmailOutboxStore store;

    @Autowired
    private EmailOutboxSender appSender;

    @Autowired
    private PlatformTransactionManager transactions;

    @BeforeEach
    void emptyQueue() {
        db.update("DELETE FROM email_outbox");
    }

    /** A sender like the application's, over a given SMTP sender (null: none configured) and retry delays. */
    private EmailOutboxSender sender(JavaMailSender smtp, Duration... retryDelays) {
        return new EmailOutboxSender(store, () -> smtp, new SyncTaskExecutor(), "GiftGenius <test@giftgenius.local>",
                new AppProperties.Outbox(true, Duration.ofSeconds(15), Duration.ofMinutes(5), 20, List.of(retryDelays)));
    }

    private Map<String, Object> row(String key) {
        return db.queryForMap("SELECT * FROM email_outbox WHERE dedupe_key = ?", key);
    }

    private void queue(String key, String to) {
        assertThat(outbox.enqueue(key, EmailKind.ORDER_STATUS, null, to, "Subject " + key, "Body " + key)).isTrue();
    }

    private String placeCod(Session s) throws Exception {
        JsonNode placed = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn());
        return placed.path("orderNumber").asString();
    }

    /** The first To address of a message. */
    static String to(MimeMessage m) {
        try {
            return m.getRecipients(Message.RecipientType.TO)[0].toString();
        } catch (MessagingException e) {
            throw new IllegalStateException(e);
        }
    }

    static String messageId(MimeMessage m) {
        try {
            return m.getHeader("Message-ID")[0];
        } catch (MessagingException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Records every message it accepts, and the Message-ID of every attempt; can be told to refuse the first few. Safe
     * to share between threads.
     */
    static final class RecordingSmtp extends JavaMailSenderImpl {
        final List<MimeMessage> accepted = Collections.synchronizedList(new ArrayList<>());
        final List<String> attemptIds = Collections.synchronizedList(new ArrayList<>());
        final AtomicInteger refuseNext = new AtomicInteger();
        final AtomicInteger calls = new AtomicInteger();
        volatile long delayMs;

        @Override
        public void send(MimeMessage message) {
            calls.incrementAndGet();
            attemptIds.add(messageId(message));
            if (delayMs > 0) {
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (refuseNext.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
                throw new MailSendException("Connection refused: smtp.example.com, for asha.rao@example.com");
            }
            accepted.add(message);
        }
    }

    // ── Queueing ───────────────────────────────────────────

    @Test
    void theSameEmailQueuedTwiceIsStoredOnce() {
        queue("test:twice", "twice@example.com");
        queue("test:twice", "twice@example.com");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox WHERE dedupe_key = 'test:twice'", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void theSameEmailQueuedFromManyTransactionsAtOnceIsStoredOnceAndNoneFails() throws Exception {
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        TransactionTemplate tx = new TransactionTemplate(transactions);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return tx.execute(s -> outbox.enqueue("test:race", EmailKind.ORDER_STATUS, null, "race@example.com",
                            "Subject", "Body"));
                }));
            }
            start.countDown();
            for (Future<Boolean> f : results) {
                assertThat(f.get(30, TimeUnit.SECONDS)).isTrue();
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox WHERE dedupe_key = 'test:race'", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void anEmailThatCantBeQueuedNeverUndoesTheTransactionItWasQueuedIn() {
        String marker = "outbox-isolation-" + UUID.randomUUID();
        new TransactionTemplate(transactions).executeWithoutResult(s -> {
            db.update("INSERT INTO contact_messages (name, email, topic, message, handled, created_at) "
                    + "VALUES ('Isolation', 'iso@example.com', 'general', ?, FALSE, UTC_TIMESTAMP(6))", marker);
            // An order that doesn't exist: the insert fails on its foreign key.
            assertThat(outbox.enqueue("test:no-such-order", EmailKind.ORDER_STATUS, -1L, "iso@example.com", "S", "B"))
                    .isFalse();
            // No usable recipient: not even attempted.
            assertThat(outbox.enqueue("test:no-recipient", EmailKind.ORDER_STATUS, null, " ", "S", "B")).isFalse();
        });
        assertThat(db.queryForObject("SELECT COUNT(*) FROM contact_messages WHERE message = ?", Integer.class, marker))
                .as("the transaction committed anyway").isEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox", Integer.class)).isZero();
    }

    @Test
    void placingAnOrderQueuesItsConfirmationOnceAndSendingNothingLeavesTheOrderAlone() throws Exception {
        Session s = register(uniqueEmail("outbox-cod"));
        addToCart(s, 1, 1);
        String number = placeCod(s);

        List<QueuedEmail> queued = queuedEmails(number);
        assertThat(queued).singleElement().satisfies(e -> {
            assertThat(e.kind()).isEqualTo("ORDER_CONFIRMED");
            assertThat(e.recipient()).isEqualTo(s.email());
            assertThat(e.subject()).contains(number);
            assertThat(e.status()).isEqualTo("PENDING");
            assertThat(e.dedupeKey()).endsWith(":confirmed:customer");
        });

        // The application's own sender: no SMTP host is configured here, so nothing can be sent.
        appSender.drain();
        assertThat(queuedEmails(number)).singleElement().satisfies(e -> assertThat(e.status()).isEqualTo("NOT_SENT"));
        assertThat(row(queued.get(0).dedupeKey())).containsEntry("sent_at", null)
                .containsEntry("last_error", EmailOutboxSender.NO_PROVIDER);
        mvc.perform(s.auth(get("/api/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    // ── Sending ────────────────────────────────────────────

    @Test
    void anAcceptedEmailIsMarkedSentOnce() {
        queue("test:ok", "ok@example.com");
        RecordingSmtp smtp = new RecordingSmtp();
        sender(smtp, Duration.ZERO).drain();
        sender(smtp, Duration.ZERO).drain(); // nothing left to send
        assertThat(smtp.accepted).singleElement().satisfies(m -> {
            assertThat(to(m)).isEqualTo("ok@example.com");
            assertThat(m.getSubject()).isEqualTo("Subject test:ok");
            assertThat(m.getFrom()[0].toString()).isEqualTo("GiftGenius <test@giftgenius.local>");
            assertThat(messageId(m)).startsWith("<gg-outbox.").endsWith("@giftgenius.local>");
        });
        Map<String, Object> row = row("test:ok");
        assertThat(row).containsEntry("status", "SENT").containsEntry("attempts", 1).containsEntry("last_error", null);
        assertThat(row.get("sent_at")).isNotNull();
    }

    @Test
    void aProviderThatRecoversGetsTheEmailOnTheRetry() {
        queue("test:recovers", "recovers@example.com");
        RecordingSmtp smtp = new RecordingSmtp();
        smtp.refuseNext.set(1);
        sender(smtp, Duration.ZERO, Duration.ZERO).drain();
        assertThat(smtp.accepted).hasSize(1);
        assertThat(row("test:recovers")).containsEntry("status", "SENT").containsEntry("attempts", 2);
        assertThat(smtp.attemptIds).as("the retry carries the first attempt's Message-ID").hasSize(2)
                .containsOnly(smtp.attemptIds.get(0));
    }

    @Test
    void aProviderThatStaysDownIsRetriedABoundedNumberOfTimesThenRecordedAsFailed() throws Exception {
        Session s = register(uniqueEmail("outbox-down"));
        addToCart(s, 1, 1);
        String number = placeCod(s);
        RecordingSmtp smtp = new RecordingSmtp();
        smtp.refuseNext.set(Integer.MAX_VALUE);

        sender(smtp, Duration.ZERO, Duration.ZERO).drain();

        assertThat(smtp.calls).as("two retries after the first attempt, then no more").hasValue(3);
        QueuedEmail e = queuedEmails(number).get(0);
        assertThat(e.status()).isEqualTo("FAILED");
        assertThat(e.attempts()).isEqualTo(3);
        String error = (String) row(e.dedupeKey()).get("last_error");
        assertThat(error).startsWith("MailSendException").contains("Connection refused")
                .doesNotContain("asha.rao@example.com").contains("a***@example.com");
        // Later passes leave it alone.
        sender(smtp, Duration.ZERO, Duration.ZERO).drain();
        assertThat(smtp.calls).hasValue(3);
        // The order was saved and stays confirmed, whatever happened to its email.
        mvc.perform(s.auth(get("/api/orders/" + number))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    @Test
    void aFailedAttemptWaitsForItsRetryDelay() {
        queue("test:waits", "waits@example.com");
        RecordingSmtp smtp = new RecordingSmtp();
        smtp.refuseNext.set(1);
        sender(smtp, Duration.ofMinutes(10)).drain();
        assertThat(smtp.calls).hasValue(1);
        Map<String, Object> row = row("test:waits");
        assertThat(row).containsEntry("status", "PENDING").containsEntry("attempts", 1);
        assertThat(db.queryForObject("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(6), next_attempt_at) "
                + "FROM email_outbox WHERE dedupe_key = 'test:waits'", Long.class)).isBetween(590L, 600L);
        sender(smtp, Duration.ofMinutes(10)).drain();
        assertThat(smtp.calls).as("not due yet").hasValue(1);
    }

    @Test
    void anAddressTheServerRefusesFailsAtOnceWithoutRetrying() {
        queue("test:refused", "refused@example.com");
        JavaMailSender smtp = new JavaMailSenderImpl() {
            @Override
            public void send(MimeMessage message) {
                throw new org.springframework.mail.MailParseException("Illegal address in string ``refused@example.com''");
            }
        };
        sender(smtp, Duration.ZERO, Duration.ZERO).drain();
        Map<String, Object> row = row("test:refused");
        assertThat(row).containsEntry("status", "FAILED").containsEntry("attempts", 1);
        assertThat((String) row.get("last_error")).doesNotContain("refused@example.com");
    }

    @Test
    void withoutAProviderNothingIsEverRecordedAsSent() {
        queue("test:none", "none@example.com");
        sender(null, Duration.ZERO).drain();
        Map<String, Object> row = row("test:none");
        assertThat(row).containsEntry("status", "NOT_SENT").containsEntry("sent_at", null).containsEntry("attempts", 1);
    }

    @Test
    void anEmailInterruptedMidDeliveryIsRecordedAsFailedAndNeverSentAgain() {
        queue("test:interrupted", "interrupted@example.com");
        // As if a sender claimed it and stopped before recording the outcome; its lease has run out.
        db.update("UPDATE email_outbox SET status = 'SENDING', attempts = 1, "
                + "locked_until = TIMESTAMPADD(MINUTE, -1, UTC_TIMESTAMP(6)) WHERE dedupe_key = 'test:interrupted'");
        RecordingSmtp smtp = new RecordingSmtp();
        sender(smtp, Duration.ZERO).drain();
        assertThat(smtp.calls).hasValue(0);
        assertThat(row("test:interrupted")).containsEntry("status", "FAILED")
                .containsEntry("last_error", EmailOutboxStore.INTERRUPTED).containsEntry("sent_at", null);
    }

    @Test
    void anEmailStillWithinItsLeaseIsLeftToTheSenderThatClaimedIt() {
        queue("test:leased", "leased@example.com");
        db.update("UPDATE email_outbox SET status = 'SENDING', attempts = 1, "
                + "locked_until = TIMESTAMPADD(MINUTE, 4, UTC_TIMESTAMP(6)) WHERE dedupe_key = 'test:leased'");
        RecordingSmtp smtp = new RecordingSmtp();
        sender(smtp, Duration.ZERO).drain();
        assertThat(smtp.calls).hasValue(0);
        assertThat(row("test:leased")).containsEntry("status", "SENDING");
    }

    @Test
    void severalSendersRunningAtOnceSendEachEmailExactlyOnce() throws Exception {
        int emails = 60;
        for (int i = 0; i < emails; i++) {
            queue("test:many:" + i, "many" + i + "@example.com");
        }
        RecordingSmtp smtp = new RecordingSmtp();
        smtp.delayMs = 5; // long enough for the senders' claims to overlap
        int senders = 4;
        ExecutorService pool = Executors.newFixedThreadPool(senders);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Callable<Void>> work = new ArrayList<>();
            for (int i = 0; i < senders; i++) {
                EmailOutboxSender each = sender(smtp, Duration.ZERO); // separate instances, as on separate servers
                work.add(() -> {
                    start.await();
                    each.drain();
                    return null;
                });
            }
            List<Future<Void>> running = new ArrayList<>();
            for (Callable<Void> w : work) {
                running.add(pool.submit(w));
            }
            start.countDown();
            for (Future<Void> f : running) {
                f.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }
        List<String> recipients = smtp.accepted.stream().map(EmailOutboxIT::to).toList();
        assertThat(recipients).hasSize(emails).doesNotHaveDuplicates();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox WHERE status = 'SENT' AND attempts = 1",
                Integer.class)).isEqualTo(emails);
    }

    // ── The SMTP server accepted it, then recording SENT failed ──

    /** A store that loses the database just as the sender records SENT, as a crash at that moment would. */
    static final class StoreThatFailsToRecordSent extends EmailOutboxStore {
        StoreThatFailsToRecordSent(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
            super(jdbc, transactions);
        }

        @Override
        public void markSent(long id) {
            throw new DataAccessResourceFailureException("Communications link failure");
        }
    }

    @Test
    void anEmailTheServerAcceptedButThatWasNeverRecordedAsSentIsRecordedAsFailedAndNotResent() {
        queue("test:accepted-then-crash", "crash@example.com");
        RecordingSmtp smtp = new RecordingSmtp();
        EmailOutboxSender crashing = new EmailOutboxSender(new StoreThatFailsToRecordSent(db, transactions), () -> smtp,
                new SyncTaskExecutor(), "GiftGenius <test@giftgenius.local>", TestProps.outbox());

        crashing.drain(); // the server accepts it; recording SENT fails; the pass stops without throwing

        assertThat(smtp.accepted).as("the server has it").hasSize(1);
        assertThat(row("test:accepted-then-crash")).containsEntry("status", "SENDING").containsEntry("attempts", 1)
                .containsEntry("sent_at", null);

        // While its lease lasts, no other sender touches it.
        sender(smtp, Duration.ZERO).drain();
        assertThat(smtp.calls).hasValue(1);
        assertThat(row("test:accepted-then-crash")).containsEntry("status", "SENDING");

        // Once the lease has run out, the next pass records it as failed (interrupted) and does not send it again.
        db.update("UPDATE email_outbox SET locked_until = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP(6)) "
                + "WHERE dedupe_key = 'test:accepted-then-crash'");
        sender(smtp, Duration.ZERO).drain();
        assertThat(smtp.calls).as("never resent: at most one delivery").hasValue(1);
        assertThat(row("test:accepted-then-crash")).containsEntry("status", "FAILED")
                .containsEntry("last_error", EmailOutboxStore.INTERRUPTED).containsEntry("sent_at", null)
                .containsEntry("attempts", 1);
    }

    @Test
    void aSendThatOutlivesItsLeaseIsStillRecordedAsSentWhenItSucceeds() {
        queue("test:slow", "slow@example.com");
        EmailOutboxStore.Claimed claimed = store.claimNext(Duration.ofMinutes(5)).orElseThrow();
        // The send takes longer than the lease; another server's pass gives up on it meanwhile...
        db.update("UPDATE email_outbox SET locked_until = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP(6)) WHERE id = ?",
                claimed.id());
        assertThat(store.failInterrupted()).isEqualTo(1);
        // ...and then the server accepts it: the record follows what actually happened.
        store.markSent(claimed.id());
        assertThat(row("test:slow")).containsEntry("status", "SENT").containsEntry("last_error", null);
    }

    // ── Configuration as the application loaded it ─────────

    @Autowired
    private AppProperties properties;

    @Test
    void theRunningApplicationUsesTheProductionRetrySchedule() {
        AppProperties.Outbox loaded = properties.mail().outbox();
        assertThat(loaded.retryDelays()).isEqualTo(TestProps.outbox().retryDelays())
                .containsExactly(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15), Duration.ofHours(1));
        assertThat(loaded.lease()).isEqualTo(Duration.ofMinutes(5));
        assertThat(appSender.maxAttempts()).isEqualTo(5);
        assertThat(loaded.senderEnabled()).as("switched off for these tests only").isFalse();
    }

    // ── Monitoring and reconciliation ──────────────────────

    @Autowired
    private EmailOutboxMonitor monitor;

    @Autowired
    private MeterRegistry meters;

    private double gauge(String name, String status) {
        var search = meters.find(name);
        if (status != null) {
            search = search.tag("status", status);
        }
        return search.gauge().value();
    }

    private double queueFailures(String reason) {
        var counter = meters.find("giftgenius.email.queue.failures").tag("reason", reason).counter();
        return counter == null ? 0 : counter.count();
    }

    @Test
    void theMetricsCountEmailsByStatusAndHowLongTheOldestHasWaited() {
        queue("test:m:pending", "m1@example.com");
        queue("test:m:sent", "m2@example.com");
        queue("test:m:failed", "m3@example.com");
        db.update("UPDATE email_outbox SET status = 'SENT', sent_at = UTC_TIMESTAMP(6) WHERE dedupe_key = 'test:m:sent'");
        db.update("UPDATE email_outbox SET status = 'FAILED' WHERE dedupe_key = 'test:m:failed'");
        db.update("UPDATE email_outbox SET created_at = TIMESTAMPADD(MINUTE, -10, UTC_TIMESTAMP(6)), "
                + "next_attempt_at = TIMESTAMPADD(MINUTE, -2, UTC_TIMESTAMP(6)) WHERE dedupe_key = 'test:m:pending'");

        monitor.refresh();

        assertThat(gauge("giftgenius.email.outbox.emails", "PENDING")).isEqualTo(1);
        assertThat(gauge("giftgenius.email.outbox.emails", "SENT")).isEqualTo(1);
        assertThat(gauge("giftgenius.email.outbox.emails", "FAILED")).isEqualTo(1);
        assertThat(gauge("giftgenius.email.outbox.emails", "NOT_SENT")).isZero();
        assertThat(gauge("giftgenius.email.outbox.oldest.pending.age.seconds", null)).isBetween(599.0, 620.0);
        assertThat(gauge("giftgenius.email.outbox.oldest.overdue.seconds", null)).isBetween(119.0, 140.0);

        db.update("DELETE FROM email_outbox");
        monitor.refresh();
        assertThat(gauge("giftgenius.email.outbox.oldest.pending.age.seconds", null)).isZero();
        assertThat(gauge("giftgenius.email.outbox.emails", "PENDING")).isZero();
    }

    @Test
    void reconciliationFindsAConfirmedOrderWithNoConfirmationEmailAndResendsNothing() throws Exception {
        Session s = register(uniqueEmail("outbox-reconcile"));
        addToCart(s, 1, 1);
        String number = placeCod(s);
        assertThat(monitor.missingConfirmations(10_000)).doesNotContain(number);

        // As if queueing its confirmation had failed: the order is confirmed, but no email is queued.
        db.update("DELETE e FROM email_outbox e JOIN orders o ON o.id = e.order_id WHERE o.order_number = ?", number);
        int queuedBefore = db.queryForObject("SELECT COUNT(*) FROM email_outbox", Integer.class);

        monitor.refresh();

        assertThat(monitor.missingConfirmations(10_000)).contains(number);
        assertThat(monitor.countMissingConfirmations()).isGreaterThanOrEqualTo(1);
        assertThat(gauge("giftgenius.email.confirmations.missing", null)).isGreaterThanOrEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox", Integer.class))
                .as("read-only: nothing queued or resent").isEqualTo(queuedBefore);
        mvc.perform(s.auth(get("/api/orders/" + number))).andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    @Test
    void reconciliationIgnoresOrdersConfirmedBeforeTheOutboxExisted() throws Exception {
        Session s = register(uniqueEmail("outbox-old"));
        addToCart(s, 1, 1);
        String number = placeCod(s);
        db.update("DELETE e FROM email_outbox e JOIN orders o ON o.id = e.order_id WHERE o.order_number = ?", number);
        db.update("UPDATE order_status_events ev JOIN orders o ON o.id = ev.order_id SET ev.created_at = '2020-01-01' "
                + "WHERE o.order_number = ? AND ev.status = 'CONFIRMED'", number);
        assertThat(monitor.missingConfirmations(10_000)).doesNotContain(number);
    }

    @Test
    void aDatabaseRefusalWhileQueueingIsCounted() {
        double before = queueFailures("database");
        assertThat(outbox.enqueue("test:fk", EmailKind.ORDER_STATUS, -1L, "fk@example.com", "S", "B")).isFalse();
        assertThat(queueFailures("database")).isEqualTo(before + 1);
    }
}
