package com.giftgenius.notify;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.mail.MailParseException;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.util.StringUtils;

import com.giftgenius.common.LogSafe;
import com.giftgenius.config.AppProperties;

import jakarta.mail.MessagingException;
import jakarta.mail.SendFailedException;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

/**
 * Delivers queued emails: woken as soon as one is queued (after its transaction commits), and every poll interval
 * for retries and anything missed.
 *
 * <p>Each pass first gives up on emails left mid-delivery by a sender that stopped, then claims due emails one at a
 * time and sends each over SMTP. An email is marked SENT only when the SMTP server accepted it. A failure is retried
 * after the configured delays, a bounded number of times, then marked FAILED; an error that retrying can't fix (a
 * malformed or refused address) fails at once. Without an SMTP host nothing is sent and the email is marked NOT_SENT.
 * Every attempt is logged with the recipient masked; stored errors carry no addresses.
 *
 * <p><b>Delivery guarantee.</b> Not exactly-once: SMTP can't confirm that. What holds:
 * <ul>
 *   <li>An email is recorded as SENT only after the SMTP server accepted it.</li>
 *   <li>A crash or database outage between the server accepting an email and SENT being recorded leaves it claimed;
 *       once its lease runs out it is recorded as FAILED ("interrupted") and not sent again. The customer may well
 *       have it; the record errs towards "failed", never towards "sent", and never resends.</li>
 *   <li>A timeout waiting for the server's reply is retried, because the client can't tell whether the server took the
 *       message. If it had, the customer gets it twice. Every attempt carries the same Message-ID
 *       ({@link #messageId}), so many mailbox providers show the copies as one message, but that is up to them.</li>
 * </ul>
 */
@Component
public class EmailOutboxSender {

    private static final Logger log = LoggerFactory.getLogger(EmailOutboxSender.class);
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+");
    static final int MAX_ERROR = 500;
    static final String NO_PROVIDER = "No email provider configured (SMTP_HOST is not set); nothing was sent";

    private final EmailOutboxStore store;
    private final Supplier<JavaMailSender> sender;
    private final TaskExecutor executor;
    private final String from;
    private final String messageIdDomain;
    private final AppProperties.Outbox props;
    private final AtomicBoolean draining = new AtomicBoolean();
    private final AtomicBoolean again = new AtomicBoolean();

    @Autowired
    public EmailOutboxSender(EmailOutboxStore store, ObjectProvider<JavaMailSender> senders,
            @Qualifier("applicationTaskExecutor") TaskExecutor executor, AppProperties properties,
            @Value("${spring.mail.host:}") String smtpHost) {
        // Boot creates a sender even for an empty spring.mail.host, so "configured" means a non-blank host.
        this(store, StringUtils.hasText(smtpHost) ? senders::getIfAvailable : () -> null, executor,
                properties.mail().from(), properties.mail().outbox());
    }

    EmailOutboxSender(EmailOutboxStore store, Supplier<JavaMailSender> sender, TaskExecutor executor, String from,
            AppProperties.Outbox props) {
        this.store = store;
        this.sender = sender;
        this.executor = executor;
        this.from = from;
        this.messageIdDomain = domainOf(from);
        this.props = props;
    }

    /** A new email is queued and its transaction has committed: deliver it now rather than at the next poll. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void onQueued(EmailOutbox.Queued event) {
        if (props.senderEnabled()) {
            executor.execute(this::drain);
        }
    }

    @Scheduled(fixedDelayString = "${app.mail.outbox.poll-interval:15s}", initialDelayString = "${app.mail.outbox.poll-interval:15s}")
    void poll() {
        if (props.senderEnabled()) {
            drain();
        }
    }

    /**
     * Sends every email that is due. One pass at a time per instance: a wake-up during a pass makes it go round
     * again instead of starting a second pass. Other instances may run their own passes at the same time.
     */
    public void drain() {
        if (!draining.compareAndSet(false, true)) {
            again.set(true);
            return;
        }
        try {
            int attempted;
            do {
                again.set(false);
                attempted = passOnce();
            } while (again.get() || attempted >= props.batchSize());
        } catch (RuntimeException e) {
            // A database outage: the next poll tries again. Nothing was marked sent that wasn't.
            log.error("Email outbox pass stopped: {}", e.getClass().getSimpleName());
        } finally {
            draining.set(false);
        }
    }

    /** One pass: up to batch-size emails. Returns how many were attempted. */
    int passOnce() {
        int interrupted = store.failInterrupted();
        if (interrupted > 0) {
            log.warn("{} email(s) were interrupted mid-delivery and marked failed (not resent)", interrupted);
        }
        int attempted = 0;
        while (attempted < props.batchSize()) {
            Optional<EmailOutboxStore.Claimed> next = store.claimNext(props.lease());
            if (next.isEmpty()) {
                break;
            }
            deliver(next.get());
            attempted++;
        }
        return attempted;
    }

    void deliver(EmailOutboxStore.Claimed email) {
        String to = LogSafe.email(email.recipient());
        JavaMailSender smtp = sender.get();
        if (smtp == null) {
            store.markNotSent(email.id(), NO_PROVIDER);
            log.info("Email {} ({}) to {} not sent: no email provider configured", email.id(), email.kind(), to);
            return;
        }
        try {
            smtp.send(message(smtp, email));
        } catch (RuntimeException e) {
            String reason = describe(e);
            if (isPermanent(e)) {
                store.markFailed(email.id(), reason);
                log.error("Email {} ({}) to {} failed permanently on attempt {}: {}", email.id(), email.kind(), to,
                        email.attempt(), reason);
            } else if (email.attempt() >= maxAttempts()) {
                store.markFailed(email.id(), reason);
                log.error("Email {} ({}) to {} failed after {} attempts, giving up: {}", email.id(), email.kind(), to,
                        email.attempt(), reason);
            } else {
                Duration wait = delayAfter(email.attempt());
                store.markRetry(email.id(), wait, reason);
                log.warn("Email {} ({}) to {} failed on attempt {}, retrying in {}: {}", email.id(), email.kind(), to,
                        email.attempt(), wait, reason);
            }
            return;
        }
        store.markSent(email.id());
        log.info("Email {} ({}) to {} sent on attempt {}", email.id(), email.kind(), to, email.attempt());
    }

    /** The email as a MIME message, with the Message-ID every attempt at this email shares. */
    MimeMessage message(JavaMailSender smtp, EmailOutboxStore.Claimed email) {
        try {
            MimeMessage mime = smtp.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(email.recipient());
            helper.setSubject(email.subject());
            helper.setText(email.body(), false);
            // Spring's sender keeps an explicit Message-ID instead of generating a new one on each send.
            mime.setHeader("Message-ID", messageId(email.id(), email.dedupeKey(), messageIdDomain));
            return mime;
        } catch (MessagingException e) {
            throw new MailPreparationException(e);
        }
    }

    /**
     * A Message-ID that depends only on the queued email: its row id and a hash of its dedupe key (which names the
     * order, event and recipient without revealing them). Every retry of the email sends the same one, and two
     * databases that reuse a row id still differ by key.
     */
    static String messageId(long id, String dedupeKey, String domain) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(dedupeKey.getBytes(StandardCharsets.UTF_8));
            return "<gg-outbox." + id + "." + HexFormat.of().formatHex(hash, 0, 8) + "@" + domain + ">";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }

    /** The From address's domain, for Message-IDs; a fixed one if MAIL_FROM can't be read. */
    static String domainOf(String from) {
        try {
            String address = new InternetAddress(from, false).getAddress();
            int at = address == null ? -1 : address.lastIndexOf('@');
            if (at > 0 && at < address.length() - 1) {
                return address.substring(at + 1).toLowerCase(java.util.Locale.ROOT);
            }
        } catch (AddressException | RuntimeException e) {
            // fall through
        }
        return "giftgenius.local";
    }

    int maxAttempts() {
        return props.retryDelays().size() + 1;
    }

    /** The wait after attempt {@code attempt} failed (1-based). */
    Duration delayAfter(int attempt) {
        List<Duration> delays = props.retryDelays();
        return delays.get(Math.min(attempt, delays.size()) - 1);
    }

    /** Errors that the same message would hit again: it can't be built, or the server refused the address. */
    static boolean isPermanent(Throwable e) {
        if (e instanceof MailParseException || e instanceof MailPreparationException) {
            return true;
        }
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof AddressException) {
                return true;
            }
            if (t instanceof SendFailedException sfe && sfe.getInvalidAddresses() != null
                    && sfe.getInvalidAddresses().length > 0) {
                return true;
            }
            if (t instanceof org.springframework.mail.MailSendException mse) {
                for (Exception failed : mse.getFailedMessages().values()) {
                    if (isPermanent(failed)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /** The error's type and message, with any email address masked, on one line, cut to fit the column. */
    static String describe(Throwable e) {
        String message = e.getMessage() == null ? "" : e.getMessage();
        message = EMAIL.matcher(message).replaceAll(m -> Matcher.quoteReplacement(LogSafe.email(m.group())));
        String text = (e.getClass().getSimpleName() + (message.isBlank() ? "" : ": " + message))
                .replaceAll("[\\r\\n\\t]+", " ").strip();
        return text.length() > MAX_ERROR ? text.substring(0, MAX_ERROR) : text;
    }
}
