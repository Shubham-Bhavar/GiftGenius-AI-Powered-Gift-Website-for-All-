package com.giftgenius.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * Queues an email in the caller's transaction, so it is saved with the order (or not at all) and survives a restart.
 * {@link EmailOutboxSender} delivers it once the transaction commits.
 *
 * <p>Each email has a dedupe key naming one recipient and one event ("order:12:confirmed:customer"). The table's
 * unique constraint on that key means a second copy is never stored, whether the event is handled twice, twice at
 * once, or on two servers.
 *
 * <p>Queueing never undoes the order: a duplicate is simply skipped, and any other database error is logged and
 * swallowed. It runs through JDBC rather than JPA so a failed insert doesn't mark the surrounding transaction for
 * rollback (MySQL rolls back just the failed statement). Every email that couldn't be queued is counted in
 * {@code giftgenius.email.queue.failures{reason}} for alerting, and {@link EmailOutboxMonitor} reports confirmed orders
 * left without a confirmation email.
 */
@Component
public class EmailOutbox {

    private static final Logger log = LoggerFactory.getLogger(EmailOutbox.class);

    static final int MAX_KEY = 200;
    static final int MAX_RECIPIENT = 255;
    static final int MAX_SUBJECT = 255;

    /** Published after an email is queued; the sender listens for it once the transaction has committed. */
    public record Queued() {
    }

    /** Why an email wasn't queued: the {@code reason} tag of the failure counter. */
    public enum Failure {
        /** Invalid dedupe key (a programming error). */
        INVALID_KEY,
        /** No usable recipient address. */
        NO_RECIPIENT,
        /** The database refused the insert. */
        DATABASE,
        /** The email's content couldn't be built (counted by the caller). */
        CONTENT
    }

    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final MeterRegistry meters;

    public EmailOutbox(JdbcTemplate jdbc, ApplicationEventPublisher events, MeterRegistry meters) {
        this.jdbc = jdbc;
        this.events = events;
        this.meters = meters;
    }

    /** Counts an email that wasn't queued. Tagged with the reason only: no recipient, order or content. */
    public void countFailure(Failure reason) {
        meters.counter("giftgenius.email.queue.failures", "reason", reason.name().toLowerCase(java.util.Locale.ROOT))
                .increment();
    }

    /**
     * Queues one email. Returns false when it wasn't queued because it couldn't be (no usable recipient, or a
     * database error, both logged); true when it is in the queue, including when it already was.
     */
    public boolean enqueue(String dedupeKey, EmailKind kind, Long orderId, String to, String subject, String body) {
        return enqueue(dedupeKey, kind, orderId, to, subject, body, null);
    }

    /**
     * Queues one email with an HTML alternative. {@code html} may be null or blank for a plain-text email; when
     * present, the email is sent as multipart/alternative with {@code body} as its plain-text part.
     */
    public boolean enqueue(String dedupeKey, EmailKind kind, Long orderId, String to, String subject, String body,
            String html) {
        if (!StringUtils.hasText(dedupeKey) || dedupeKey.length() > MAX_KEY) {
            log.error("Email {} not queued: invalid dedupe key", kind);
            countFailure(Failure.INVALID_KEY);
            return false;
        }
        if (!StringUtils.hasText(to) || to.length() > MAX_RECIPIENT || !to.contains("@")) {
            log.warn("Email {} not queued: no usable recipient", dedupeKey);
            countFailure(Failure.NO_RECIPIENT);
            return false;
        }
        String safeSubject = subject == null ? "" : subject.replaceAll("[\\r\\n]+", " ").strip();
        if (safeSubject.length() > MAX_SUBJECT) {
            safeSubject = safeSubject.substring(0, MAX_SUBJECT);
        }
        try {
            // A second copy of the same key changes nothing: no error, no new row, the first one stands.
            jdbc.update("""
                    INSERT INTO email_outbox (dedupe_key, kind, order_id, recipient, subject, body_text, body_html,
                        status, attempts, next_attempt_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
                    ON DUPLICATE KEY UPDATE dedupe_key = dedupe_key""",
                    dedupeKey, kind.name(), orderId, to.strip(), safeSubject, body == null ? "" : body,
                    StringUtils.hasText(html) ? html : null);
        } catch (org.springframework.dao.PessimisticLockingFailureException e) {
            // A deadlock rolls back the whole transaction in MySQL, not just this statement: pretending otherwise would
            // let the rest of the request commit without the order. Fail the request; the client may retry (409).
            countFailure(Failure.DATABASE);
            throw e;
        } catch (DataAccessException e) {
            // The order matters more than its email: never let queueing fail the order. Logged for follow-up.
            log.error("Email {} ({}) could not be queued: {}", dedupeKey, kind,
                    e.getMostSpecificCause().getClass().getSimpleName());
            countFailure(Failure.DATABASE);
            return false;
        }
        events.publishEvent(new Queued());
        return true;
    }
}
