package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;

import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;

/**
 * The application as it is configured in production, with SMTP settings pointing at a mail server inside the test
 * (GreenMail, 127.0.0.1 only): placing an order through the API is enough for its emails to arrive, sent by the
 * application's own background sender after the order's transaction commits. Nothing leaves this machine.
 *
 * <p>The context is closed afterwards, so its sender doesn't pick up emails queued by other test classes.
 */
@DirtiesContext
@Timeout(value = 120, threadMode = Timeout.ThreadMode.SEPARATE_THREAD)
class EmailDeliveryAppIT extends AbstractIT {

    private static final GreenMail SERVER = start();
    private static final String OPS = "ops@it.test";
    private static final String SALES = "sales@it.test";

    private static GreenMail start() {
        OUTBOX_SENDER.set(true);
        GreenMail server = new GreenMail(new ServerSetup(0, "127.0.0.1", ServerSetup.PROTOCOL_SMTP));
        server.start();
        return server;
    }

    @DynamicPropertySource
    static void smtp(DynamicPropertyRegistry r) {
        r.add("spring.mail.host", () -> "127.0.0.1");
        r.add("spring.mail.port", () -> SERVER.getSmtp().getPort());
        r.add("spring.mail.properties.mail.smtp.auth", () -> "false");
        r.add("spring.mail.properties.mail.smtp.starttls.enable", () -> "false");
        r.add("app.mail.from", () -> "GiftGenius <orders@giftgenius.test>");
        r.add("app.mail.outbox.poll-interval", () -> "1s");
        r.add("app.mail.notify-admin-emails", () -> OPS + ", " + SALES);
    }

    @AfterAll
    static void stop() {
        OUTBOX_SENDER.set(false);
        SERVER.stop();
    }

    private static List<MimeMessage> received(String recipient) throws Exception {
        List<MimeMessage> out = new ArrayList<>();
        for (MimeMessage m : SERVER.getReceivedMessages()) {
            if (m.getRecipients(Message.RecipientType.TO)[0].toString().equalsIgnoreCase(recipient)) {
                out.add(m);
            }
        }
        return out;
    }

    @Test
    void placingAndCancellingAnOrderEmailsTheCustomerAndEveryOwnerAddressOnce() throws Exception {
        Session s = register(uniqueEmail("smtp-app"));
        addToCart(s, 1, 1);
        String number = body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn())
                .path("orderNumber").asString();

        assertThat(SERVER.waitForIncomingEmail(30_000, 3)).as("the confirmation and two owner copies arrive").isTrue();
        assertThat(received(s.email())).singleElement().satisfies(m -> {
            assertThat(m.getSubject()).isEqualTo("Your GiftGenius order " + number + " is confirmed");
            assertThat(m.getFrom()[0].toString()).isEqualTo("GiftGenius <orders@giftgenius.test>");
            assertThat(m.getHeader("Message-ID")[0]).startsWith("<gg-outbox.").endsWith("@giftgenius.test>");
        });
        assertThat(received(OPS)).singleElement()
                .satisfies(m -> assertThat(m.getSubject()).startsWith("New GiftGenius order " + number));
        assertThat(received(SALES)).hasSize(1);
        assertThat(received(ADMIN_EMAIL)).as("configured addresses replace the admin account's").isEmpty();

        mvc.perform(s.auth(post("/api/orders/" + number + "/cancel"))).andExpect(status().isOk());
        assertThat(SERVER.waitForIncomingEmail(30_000, 4)).as("the cancellation arrives").isTrue();
        assertThat(received(s.email())).hasSize(2).last()
                .satisfies(m -> assertThat(m.getSubject()).isEqualTo("Your GiftGenius order " + number + " was cancelled"));

        // The record catches up with the delivery a moment later.
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline
                && queuedEmails(number).stream().anyMatch(e -> !e.status().equals("SENT"))) {
            Thread.sleep(100);
        }
        assertThat(queuedEmails(number)).hasSize(4).allSatisfy(e -> {
            assertThat(e.status()).isEqualTo("SENT");
            assertThat(e.attempts()).isEqualTo(1);
        });
        assertThat(SERVER.getReceivedMessages()).as("nothing sent twice").hasSize(4);
    }
}
