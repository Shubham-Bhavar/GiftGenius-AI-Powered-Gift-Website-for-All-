package com.giftgenius.notify;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The email_outbox table, for the sender. All times come from the database clock (UTC), so several servers agree on
 * what is due whatever their own clocks say.
 */
@Component
public class EmailOutboxStore {

    /** One email claimed by this sender: {@code attempt} is the number of this attempt, starting at 1. */
    public record Claimed(long id, String dedupeKey, String kind, String recipient, String subject, String body,
            int attempt) {
    }

    static final String INTERRUPTED = "Interrupted during delivery; not retried, so it can't be sent twice";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public EmailOutboxStore(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(transactions);
    }

    /**
     * Claims the next due email, or none. The row is locked with SKIP LOCKED, so senders running at the same time
     * each take a different email instead of waiting for (or repeating) another's; the claim is committed before
     * anything is sent.
     */
    public Optional<Claimed> claimNext(Duration lease) {
        return tx.execute(status -> {
            List<Claimed> due = jdbc.query("""
                    SELECT id, dedupe_key, kind, recipient, subject, body_text, attempts FROM email_outbox
                    WHERE status = 'PENDING' AND next_attempt_at <= UTC_TIMESTAMP(6)
                    ORDER BY next_attempt_at, id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED""",
                    (rs, i) -> new Claimed(rs.getLong("id"), rs.getString("dedupe_key"), rs.getString("kind"),
                            rs.getString("recipient"), rs.getString("subject"), rs.getString("body_text"),
                            rs.getInt("attempts") + 1));
            if (due.isEmpty()) {
                return Optional.empty();
            }
            Claimed claimed = due.get(0);
            jdbc.update("""
                    UPDATE email_outbox SET status = 'SENDING', attempts = ?,
                        locked_until = TIMESTAMPADD(MICROSECOND, ?, UTC_TIMESTAMP(6)), updated_at = UTC_TIMESTAMP(6)
                    WHERE id = ?""", claimed.attempt(), micros(lease), claimed.id());
            return Optional.of(claimed);
        });
    }

    /**
     * Gives up on emails whose sender stopped mid-delivery (crashed, or lost its database connection) and whose lease
     * has run out. Whether the SMTP server accepted them is unknown, so they are not sent again: they are recorded as
     * failed, never as sent. Returns how many there were.
     */
    public int failInterrupted() {
        return jdbc.update("""
                UPDATE email_outbox SET status = 'FAILED', last_error = ?, locked_until = NULL,
                    updated_at = UTC_TIMESTAMP(6)
                WHERE status = 'SENDING' AND locked_until < UTC_TIMESTAMP(6)""", INTERRUPTED);
    }

    /** Accepted by the SMTP server. The only way an email becomes SENT. */
    public void markSent(long id) {
        jdbc.update("""
                UPDATE email_outbox SET status = 'SENT', sent_at = UTC_TIMESTAMP(6), locked_until = NULL,
                    last_error = NULL, updated_at = UTC_TIMESTAMP(6)
                WHERE id = ?""", id);
    }

    /** Failed, with attempts left: due again after {@code wait}. */
    public void markRetry(long id, Duration wait, String reason) {
        jdbc.update("""
                UPDATE email_outbox SET status = 'PENDING', locked_until = NULL, last_error = ?,
                    next_attempt_at = TIMESTAMPADD(MICROSECOND, ?, UTC_TIMESTAMP(6)), updated_at = UTC_TIMESTAMP(6)
                WHERE id = ? AND status = 'SENDING'""", reason, micros(wait), id);
    }

    /** Given up: out of attempts, or an error that retrying can't fix. */
    public void markFailed(long id, String reason) {
        jdbc.update("""
                UPDATE email_outbox SET status = 'FAILED', locked_until = NULL, last_error = ?,
                    updated_at = UTC_TIMESTAMP(6)
                WHERE id = ? AND status = 'SENDING'""", reason, id);
    }

    /** No email provider was configured, so nothing was sent: recorded as such, never as sent. */
    public void markNotSent(long id, String reason) {
        jdbc.update("""
                UPDATE email_outbox SET status = 'NOT_SENT', locked_until = NULL, last_error = ?,
                    updated_at = UTC_TIMESTAMP(6)
                WHERE id = ? AND status = 'SENDING'""", reason, id);
    }

    private static long micros(Duration d) {
        return d.toNanos() / 1_000;
    }
}
