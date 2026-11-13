package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.junit.jupiter.api.extension.ExtendWith;

import com.giftgenius.config.AppProperties;
import com.giftgenius.it.AbstractIT;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;

import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;
import tools.jackson.databind.JsonNode;

/**
 * Order emails delivered over real SMTP to a mail server running inside the test (GreenMail, on 127.0.0.1 only):
 * what actually arrives, in which form, and what the outbox records when the server is down, comes back, or refuses
 * the sender's sign-in. Nothing leaves this machine.
 */
@Timeout(value = 90, threadMode = Timeout.ThreadMode.SEPARATE_THREAD)
@ExtendWith(OutputCaptureExtension.class)
class EmailDeliveryIT extends AbstractIT {

    private static final String FROM = "GiftGenius <orders@giftgenius.test>";

    @Autowired
    private EmailOutbox outbox;
    @Autowired
    private EmailOutboxStore store;

    private GreenMail server;
    private int port;

    @BeforeEach
    void startMailServer() {
        db.update("DELETE FROM email_outbox");
        server = new GreenMail(new ServerSetup(0, "127.0.0.1", ServerSetup.PROTOCOL_SMTP));
        server.start();
        port = server.getSmtp().getPort();
    }

    @AfterEach
    void stopMailServer() {
        server.stop();
    }

    /** Spring's own SMTP sender, as the application configures it, pointed at the test server. */
    private JavaMailSenderImpl smtp(String username, String password) {
        JavaMailSenderImpl smtp = new JavaMailSenderImpl();
        smtp.setHost("127.0.0.1");
        smtp.setPort(port);
        smtp.setDefaultEncoding("UTF-8");
        Properties p = smtp.getJavaMailProperties();
        p.put("mail.smtp.connectiontimeout", "3000");
        p.put("mail.smtp.timeout", "3000");
        p.put("mail.smtp.writetimeout", "3000");
        if (username != null) {
            smtp.setUsername(username);
            smtp.setPassword(password);
            p.put("mail.smtp.auth", "true");
        }
        return smtp;
    }

    private EmailOutboxSender sender(JavaMailSenderImpl smtp, Duration... retryDelays) {
        return new EmailOutboxSender(store, () -> smtp, new SyncTaskExecutor(), FROM,
                new AppProperties.Outbox(true, Duration.ofSeconds(15), Duration.ofMinutes(5), 20, List.of(retryDelays)));
    }

    private Map<String, Object> row(String key) {
        return db.queryForMap("SELECT * FROM email_outbox WHERE dedupe_key = ?", key);
    }

    private String placeCod(Session s) throws Exception {
        JsonNode placed = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn());
        return placed.path("orderNumber").asString();
    }

    private static String to(MimeMessage m) throws Exception {
        return m.getRecipients(Message.RecipientType.TO)[0].toString();
    }

    private MimeMessage received(String recipient) throws Exception {
        for (MimeMessage m : server.getReceivedMessages()) {
            if (to(m).equalsIgnoreCase(recipient)) {
                return m;
            }
        }
        throw new AssertionError("No email arrived for " + recipient);
    }

    /** The text parts of a message, in order: {content type, content}. */
    private static List<String[]> parts(Part part) throws Exception {
        List<String[]> out = new ArrayList<>();
        Object content = part.getContent();
        if (content instanceof Multipart multi) {
            for (int i = 0; i < multi.getCount(); i++) {
                out.addAll(parts(multi.getBodyPart(i)));
            }
        } else {
            out.add(new String[] { part.getContentType().toLowerCase(Locale.ROOT), ((String) content).strip() });
        }
        return out;
    }

    /** What the application logged, without the test mail server's own log lines (it names its mailboxes). */
    private static String applicationLog(CapturedOutput output) {
        return output.getAll().lines().filter(line -> !line.contains("greenmail"))
                .collect(java.util.stream.Collectors.joining(System.lineSeparator()));
    }

    // ── An order's emails, as they arrive ──

    @Test
    void anOrdersConfirmationAndTheOwnersCopyArriveOverSmtpAsTextAndHtml() throws Exception {
        Session s = register(uniqueEmail("delivery"));
        addToCart(s, 1, 2);
        String number = placeCod(s);

        sender(smtp(null, null)).drain();

        assertThat(server.getReceivedMessages()).as("the customer's confirmation and the owner's copy").hasSize(2);
        MimeMessage confirmation = received(s.email());
        assertThat(confirmation.getSubject()).isEqualTo("Your GiftGenius order " + number + " is confirmed");
        assertThat(confirmation.getFrom()[0].toString()).isEqualTo(FROM);
        assertThat(confirmation.getSentDate()).isNotNull();
        assertThat(confirmation.getContentType()).startsWith("multipart/");
        List<String[]> parts = parts(confirmation);
        assertThat(parts).as("plain text first, then HTML").hasSize(2);
        assertThat(parts.get(0)[0]).startsWith("text/plain").contains("utf-8");
        assertThat(parts.get(1)[0]).startsWith("text/html").contains("utf-8");
        for (String[] part : parts) {
            assertThat(part[1]).contains("Hi Asha,").contains(number).contains("× 2").contains("₹")
                    .contains("Cash on delivery").contains("Confirmed").contains("12 MG Road").contains("IST")
                    .contains("/track?order=" + number);
        }
        assertThat(parts.get(1)[1]).startsWith("<!DOCTYPE html>");
        Map<String, Object> saved = row(queuedEmails(number, "ORDER_CONFIRMED").get(0).dedupeKey());
        assertThat(confirmation.getHeader("Message-ID")[0])
                .isEqualTo(EmailOutboxSender.messageId(((Number) saved.get("id")).longValue(),
                        (String) saved.get("dedupe_key"), "giftgenius.test"));

        MimeMessage owner = received(ADMIN_EMAIL);
        assertThat(owner.getSubject()).startsWith("New GiftGenius order " + number + " (₹");
        for (String[] part : parts(owner)) {
            assertThat(part[1]).contains(number).contains("Asha Rao").contains(s.email()).contains("Pune")
                    .contains("Sold by GiftGenius").doesNotContain("98765").doesNotContain("MG Road")
                    .doesNotContain("411001");
        }

        assertThat(queuedEmails(number)).hasSize(2).allSatisfy(e -> {
            assertThat(e.status()).isEqualTo("SENT");
            assertThat(e.attempts()).isEqualTo(1);
            assertThat(row(e.dedupeKey()).get("sent_at")).isNotNull();
        });

        // Nothing is sent again, by this sender or another.
        sender(smtp(null, null)).drain();
        assertThat(server.getReceivedMessages()).hasSize(2);
    }

    @Test
    void aTextOnlyEmailArrivesAsPlainTextWithItsCharactersIntact() throws Exception {
        String body = "Total ₹1,499.00 · नमस्ते · “quotes” — done";
        assertThat(outbox.enqueue("test:plain", EmailKind.ORDER_STATUS, null, "plain@example.com",
                "Update on your order ₹", body)).isTrue();
        sender(smtp(null, null)).drain();
        MimeMessage m = received("plain@example.com");
        assertThat(m.getContentType()).startsWith("text/plain");
        assertThat(m.getSubject()).isEqualTo("Update on your order ₹");
        assertThat(((String) m.getContent()).strip()).isEqualTo(body);
        assertThat(row("test:plain")).containsEntry("status", "SENT");
    }

    // ── A mail server that is down, then back ──

    @Test
    void aServerThatIsDownIsRetriedAndTheEmailArrivesOnceWhenItIsBack(CapturedOutput output) throws Exception {
        assertThat(outbox.enqueue("test:outage", EmailKind.ORDER_STATUS, null, "outage@example.com", "Subject",
                "Body")).isTrue();
        server.stop();
        // A real wait before the retry, so one pass makes one attempt.
        EmailOutboxSender sender = sender(smtp(null, null), Duration.ofSeconds(1), Duration.ofSeconds(1));

        sender.passOnce();

        Map<String, Object> afterFailure = row("test:outage");
        assertThat(afterFailure).containsEntry("status", "PENDING").containsEntry("attempts", 1)
                .containsEntry("sent_at", null);
        assertThat((String) afterFailure.get("last_error")).isNotBlank().doesNotContain("outage@example.com");

        server = new GreenMail(new ServerSetup(port, "127.0.0.1", ServerSetup.PROTOCOL_SMTP));
        server.start();
        sender.drain();
        assertThat(server.getReceivedMessages()).as("not before its retry is due").isEmpty();
        Thread.sleep(1200);
        sender.drain();

        assertThat(server.getReceivedMessages()).as("delivered once the server is back").hasSize(1);
        assertThat(row("test:outage")).containsEntry("status", "SENT").containsEntry("attempts", 2);
        assertThat(applicationLog(output)).as("the application's logs mask the address").contains("o***@example.com")
                .doesNotContain("outage@example.com");
    }

    @Test
    void aServerThatStaysDownLeavesTheEmailFailedAfterTheConfiguredAttempts() {
        assertThat(outbox.enqueue("test:down", EmailKind.ORDER_STATUS, null, "down@example.com", "Subject", "Body"))
                .isTrue();
        server.stop();
        sender(smtp(null, null), Duration.ZERO, Duration.ZERO).drain();
        assertThat(row("test:down")).containsEntry("status", "FAILED").containsEntry("attempts", 3)
                .containsEntry("sent_at", null);
    }

    // ── Signing in to the mail server ──

    @Test
    void theConfiguredSmtpSignInIsUsedAndAWrongPasswordNeverReachesTheRecordOrTheLogs(CapturedOutput output)
            throws Exception {
        String password = "smtp-" + UUID.randomUUID();
        server.setUser("mailer@giftgenius.test", "mailer", password);
        assertThat(outbox.enqueue("test:auth-ok", EmailKind.ORDER_STATUS, null, "auth@example.com", "Subject", "Body"))
                .isTrue();
        sender(smtp("mailer", password)).drain();
        assertThat(server.getReceivedMessages()).hasSize(1);
        assertThat(row("test:auth-ok")).containsEntry("status", "SENT");

        String wrong = "wrong-" + UUID.randomUUID();
        assertThat(outbox.enqueue("test:auth-bad", EmailKind.ORDER_STATUS, null, "auth@example.com", "Subject",
                "Body")).isTrue();
        sender(smtp("mailer", wrong), Duration.ZERO).drain();
        assertThat(server.getReceivedMessages()).as("refused sign-in: nothing more delivered").hasSize(1);
        Map<String, Object> bad = row("test:auth-bad");
        assertThat(bad).containsEntry("status", "FAILED").containsEntry("attempts", 2).containsEntry("sent_at", null);
        assertThat((String) bad.get("last_error")).doesNotContain(wrong).doesNotContain(password);
        assertThat(output.getAll()).doesNotContain(wrong).doesNotContain(password);
    }

    // ── Several senders, one real server ──

    @Test
    void severalSendersOverRealSmtpDeliverEachEmailExactlyOnce() throws Exception {
        int emails = 24;
        for (int i = 0; i < emails; i++) {
            assertThat(outbox.enqueue("test:many:" + i, EmailKind.ORDER_STATUS, null, "many" + i + "@example.com",
                    "Subject " + i, "Body " + i)).isTrue();
        }
        int senders = 3;
        ExecutorService pool = Executors.newFixedThreadPool(senders);
        CountDownLatch start = new CountDownLatch(1);
        try {
            for (int i = 0; i < senders; i++) {
                EmailOutboxSender sender = sender(smtp(null, null));
                pool.submit(() -> {
                    start.await();
                    sender.drain();
                    return null;
                });
            }
            start.countDown();
            pool.shutdown();
            assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }
        MimeMessage[] received = server.getReceivedMessages();
        assertThat(received).hasSize(emails);
        List<String> recipients = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (MimeMessage m : received) {
            recipients.add(to(m));
            ids.add(m.getHeader("Message-ID")[0]);
        }
        assertThat(recipients).doesNotHaveDuplicates();
        assertThat(ids).doesNotHaveDuplicates();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM email_outbox WHERE status = 'SENT' AND attempts = 1",
                Integer.class)).isEqualTo(emails);
        assertThat(Arrays.stream(received).map(m -> {
            try {
                return m.getSubject();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        })).allMatch(subject -> subject.startsWith("Subject "));
    }
}
