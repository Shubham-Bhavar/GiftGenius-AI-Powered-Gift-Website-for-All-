package com.giftgenius.notify;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * Read-only watch over the email outbox, for alerting (Prometheus, on the management port). Every few minutes it
 * counts emails by status, measures how long the oldest waiting email has waited, and runs the reconciliation: orders
 * confirmed since the outbox was installed that have no confirmation email queued. It changes nothing and resends
 * nothing; what to do about a finding is an operator's decision (see docs/EMAIL_NOTIFICATIONS.md).
 *
 * <p>The values are refreshed on a schedule rather than on every scrape, so scraping never touches the database, and
 * a refresh that fails (database unavailable) keeps the last values and logs a warning.
 *
 * <p>Meters: {@code giftgenius.email.outbox.emails{status}}, {@code giftgenius.email.outbox.oldest.pending.age.seconds}
 * (since it was queued), {@code giftgenius.email.outbox.oldest.overdue.seconds} (past its due time, which only grows
 * when nothing is sending), {@code giftgenius.email.confirmations.missing}; and, counted where it happens,
 * {@code giftgenius.email.queue.failures{reason}} ({@link EmailOutbox}).
 */
@Component
public class EmailOutboxMonitor {

    private static final Logger log = LoggerFactory.getLogger(EmailOutboxMonitor.class);
    /** At most this many order numbers in one log line. */
    static final int LOGGED = 20;

    /** The statuses of email_outbox.status. */
    enum Status {
        PENDING, SENDING, SENT, FAILED, NOT_SENT
    }

    /**
     * Orders that reached CONFIRMED after V7 was installed and have no ORDER_CONFIRMED row. The install time is
     * Flyway's (a TIMESTAMP shown in the session's zone), turned into UTC like the other timestamps.
     */
    private static final String MISSING = """
            FROM orders o
            JOIN order_status_events ev ON ev.order_id = o.id AND ev.status = 'CONFIRMED'
            LEFT JOIN email_outbox e ON e.order_id = o.id AND e.kind = 'ORDER_CONFIRMED'
            WHERE e.id IS NULL
              AND ev.created_at >= (SELECT TIMESTAMPADD(SECOND, -TIMESTAMPDIFF(SECOND, installed_on, NOW()),
                                        UTC_TIMESTAMP())
                                    FROM flyway_schema_history WHERE version = '7' AND success = 1)""";

    private final JdbcTemplate jdbc;
    private final Map<Status, AtomicLong> byStatus = new EnumMap<>(Status.class);
    private final AtomicLong oldestPendingAge = new AtomicLong();
    private final AtomicLong oldestOverdue = new AtomicLong();
    private final AtomicLong missing = new AtomicLong();

    public EmailOutboxMonitor(JdbcTemplate jdbc, MeterRegistry meters) {
        this.jdbc = jdbc;
        for (Status s : Status.values()) {
            AtomicLong value = new AtomicLong();
            byStatus.put(s, value);
            Gauge.builder("giftgenius.email.outbox.emails", value, AtomicLong::get).tag("status", s.name())
                    .description("Emails in the outbox, by status").register(meters);
        }
        Gauge.builder("giftgenius.email.outbox.oldest.pending.age.seconds", oldestPendingAge, AtomicLong::get)
                .description("How long the oldest waiting email has been in the queue (0 when none)").register(meters);
        Gauge.builder("giftgenius.email.outbox.oldest.overdue.seconds", oldestOverdue, AtomicLong::get)
                .description("How far past its due time the most overdue waiting email is (0 when none)")
                .register(meters);
        Gauge.builder("giftgenius.email.confirmations.missing", missing, AtomicLong::get)
                .description("Orders confirmed since the outbox was installed with no confirmation email queued")
                .register(meters);
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    void scheduledRefresh() {
        try {
            refresh();
        } catch (DataAccessException e) {
            log.warn("Email outbox metrics not refreshed: {}", e.getMostSpecificCause().getClass().getSimpleName());
        }
    }

    /** Reads the outbox and updates every value. Read-only. */
    public void refresh() {
        Map<Status, Long> counts = new EnumMap<>(Status.class);
        jdbc.query("SELECT status, COUNT(*) FROM email_outbox GROUP BY status", rs -> {
            try {
                counts.put(Status.valueOf(rs.getString(1)), rs.getLong(2));
            } catch (IllegalArgumentException unknown) {
                // A status this version doesn't know: not counted.
            }
        });
        byStatus.forEach((status, value) -> value.set(counts.getOrDefault(status, 0L)));
        oldestPendingAge.set(seconds("""
                SELECT TIMESTAMPDIFF(SECOND, MIN(created_at), UTC_TIMESTAMP(6)) FROM email_outbox
                WHERE status = 'PENDING'"""));
        oldestOverdue.set(seconds("""
                SELECT TIMESTAMPDIFF(SECOND, MIN(next_attempt_at), UTC_TIMESTAMP(6)) FROM email_outbox
                WHERE status = 'PENDING' AND next_attempt_at <= UTC_TIMESTAMP(6)"""));
        long missingNow = countMissingConfirmations();
        missing.set(missingNow);
        if (missingNow > 0) {
            log.warn("{} confirmed order(s) have no confirmation email queued, for example {}. Nothing is resent "
                    + "automatically; see docs/EMAIL_NOTIFICATIONS.md.", missingNow, missingConfirmations(LOGGED));
        }
    }

    /** How many confirmed orders lack a queued confirmation email (since the outbox was installed). */
    public long countMissingConfirmations() {
        Long n = jdbc.queryForObject("SELECT COUNT(DISTINCT o.id) " + MISSING, Long.class);
        return n == null ? 0 : n;
    }

    /** Up to {@code limit} of those orders' numbers, oldest confirmation first. Order numbers only: no customer data. */
    public List<String> missingConfirmations(int limit) {
        return jdbc.queryForList("SELECT o.order_number " + MISSING
                + " GROUP BY o.id, o.order_number ORDER BY MIN(ev.created_at) LIMIT ?", String.class, limit);
    }

    long emails(Status status) {
        return byStatus.get(status).get();
    }

    long oldestPendingAgeSeconds() {
        return oldestPendingAge.get();
    }

    long oldestOverdueSeconds() {
        return oldestOverdue.get();
    }

    long missingConfirmationsGauge() {
        return missing.get();
    }

    private long seconds(String sql) {
        Long s = jdbc.queryForObject(sql, Long.class);
        return s == null ? 0 : Math.max(0, s);
    }
}
