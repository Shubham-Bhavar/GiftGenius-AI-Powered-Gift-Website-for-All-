package com.giftgenius.notify;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * What can truthfully be said about one queued email (GG-53), for pages that mention it. Read from the outbox, never
 * assumed:
 * <ul>
 * <li>{@link Shown#SENDING}: queued, or being handed to the mail server, and not refused yet;</li>
 * <li>{@link Shown#SENT}: the mail server accepted it. That is not proof it reached the inbox;</li>
 * <li>{@link Shown#FAILED}: every attempt failed, or the server refused it;</li>
 * <li>{@link Shown#NOT_SENT}: it will not be sent, because no email provider is configured.</li>
 * </ul>
 * Empty when no such email was queued (its content couldn't be built, or the order predates the outbox).
 */
@Component
public class EmailStatus {

    public enum Shown { SENDING, SENT, FAILED, NOT_SENT }

    private final JdbcTemplate jdbc;
    private final boolean deliveryConfigured;

    public EmailStatus(JdbcTemplate jdbc, @Value("${spring.mail.host:}") String smtpHost) {
        this.jdbc = jdbc;
        // As EmailOutboxSender decides it: without an SMTP host nothing is ever sent.
        this.deliveryConfigured = StringUtils.hasText(smtpHost);
    }

    public Optional<Shown> of(String dedupeKey) {
        List<String> statuses = jdbc.queryForList("SELECT status FROM email_outbox WHERE dedupe_key = ?", String.class,
                dedupeKey);
        if (statuses.isEmpty()) {
            return Optional.empty();
        }
        String status = statuses.get(0);
        if (!deliveryConfigured || "NOT_SENT".equals(status)) {
            return Optional.of(Shown.NOT_SENT);
        }
        return Optional.of(switch (status) {
            case "SENT" -> Shown.SENT;
            case "FAILED" -> Shown.FAILED;
            default -> Shown.SENDING; // PENDING (waiting or between retries) or SENDING
        });
    }
}
