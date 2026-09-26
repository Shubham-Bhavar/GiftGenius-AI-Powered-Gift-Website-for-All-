package com.giftgenius.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import com.giftgenius.config.AppProperties;

import jakarta.annotation.PostConstruct;

/**
 * Sends plain-text email in the background, after the surrounding transaction commits (so a
 * rolled-back order never emails the customer). Without SMTP settings, mail is logged instead.
 */
@Component
public class Mailer {

    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    private final ObjectProvider<JavaMailSender> senderProvider;
    private final TaskExecutor executor;
    private final String from;
    /** Boot creates a sender even for an empty spring.mail.host, so "configured" means a non-blank host. */
    private final boolean configured;

    public Mailer(ObjectProvider<JavaMailSender> senderProvider,
            @Qualifier("applicationTaskExecutor") TaskExecutor executor, AppProperties properties,
            @Value("${spring.mail.host:}") String smtpHost) {
        this.senderProvider = senderProvider;
        this.executor = executor;
        this.from = properties.mail().from();
        this.configured = StringUtils.hasText(smtpHost);
    }

    @PostConstruct
    void warnIfUnconfigured() {
        if (!configured) {
            log.warn("SMTP_HOST is not set: emails (order updates, password resets) will be logged, not sent.");
        }
    }

    public void send(String to, String subject, String body) {
        Runnable task = () -> executor.execute(() -> deliver(to, subject, body));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    private void deliver(String to, String subject, String body) {
        JavaMailSender sender = configured ? senderProvider.getIfAvailable() : null;
        if (sender == null) {
            log.info("Email not sent (SMTP not configured) to {}: {}", to, subject);
            log.debug("Email body for {}:\n{}", to, body);
            return;
        }
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(from);
            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(body);
            sender.send(msg);
        } catch (Exception e) {
            log.error("Failed to send email '{}' to {}: {}", subject, to, e.getMessage());
        }
    }
}
