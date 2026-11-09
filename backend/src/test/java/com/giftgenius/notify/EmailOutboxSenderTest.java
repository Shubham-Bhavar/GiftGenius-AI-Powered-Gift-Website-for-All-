package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import com.giftgenius.TestProps;
import com.giftgenius.config.AppProperties;

import jakarta.mail.Address;
import jakarta.mail.Message;
import jakarta.mail.SendFailedException;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.URLName;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

/** A runaway loop must fail the build, not hang it. */
@Timeout(value = 10, threadMode = Timeout.ThreadMode.SEPARATE_THREAD)
class EmailOutboxSenderTest {

    private final EmailOutboxStore store = mock(EmailOutboxStore.class);
    private final JavaMailSender smtp = mock(JavaMailSender.class);
    private final Session session = Session.getInstance(new Properties());

    EmailOutboxSenderTest() {
        when(smtp.createMimeMessage()).thenAnswer(i -> new MimeMessage(session));
    }

    private EmailOutboxSender sender(JavaMailSender with, AppProperties.Outbox props) {
        return new EmailOutboxSender(store, () -> with, new SyncTaskExecutor(), "GiftGenius <test@giftgenius.local>",
                props);
    }

    private EmailOutboxSender sender() {
        return sender(smtp, TestProps.outbox());
    }

    private static EmailOutboxStore.Claimed claimed(int attempt) {
        return new EmailOutboxStore.Claimed(5, "order:42:confirmed:customer", "ORDER_CONFIRMED", "asha.rao@example.com",
                "Your order", "Body", attempt);
    }

    @Test
    void anEmailIsMarkedSentOnlyAfterTheSmtpServerAcceptsIt() throws Exception {
        sender().deliver(claimed(1));
        InOrder order = inOrder(smtp, store);
        ArgumentCaptor<MimeMessage> msg = ArgumentCaptor.forClass(MimeMessage.class);
        order.verify(smtp).send(msg.capture());
        order.verify(store).markSent(5);
        MimeMessage m = msg.getValue();
        assertThat(m.getRecipients(Message.RecipientType.TO)).extracting(Address::toString)
                .containsExactly("asha.rao@example.com");
        assertThat(m.getFrom()[0].toString()).isEqualTo("GiftGenius <test@giftgenius.local>");
        assertThat(m.getSubject()).isEqualTo("Your order");
        assertThat(m.getContent()).isEqualTo("Body");
    }

    // ── Message-ID ─────────────────────────────────────────

    private static List<String> messageIds(ArgumentCaptor<MimeMessage> sent) throws Exception {
        List<String> ids = new java.util.ArrayList<>();
        for (MimeMessage m : sent.getAllValues()) {
            ids.add(m.getHeader("Message-ID")[0]);
        }
        return ids;
    }

    @Test
    void everyAttemptAtAnEmailCarriesTheSameMessageId() throws Exception {
        doThrow(new MailSendException("Read timed out")).doNothing().when(smtp).send(any(MimeMessage.class));
        EmailOutboxSender s = sender();
        s.deliver(claimed(1));
        s.deliver(claimed(2));
        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(smtp, times(2)).send(sent.capture());
        List<String> ids = messageIds(sent);
        assertThat(ids.get(0)).isEqualTo(ids.get(1)).matches("<gg-outbox\\.5\\.[0-9a-f]{16}@giftgenius\\.local>")
                .doesNotContain("order:42");
    }

    @Test
    void differentEmailsGetDifferentMessageIds() {
        String a = EmailOutboxSender.messageId(5, "order:42:confirmed:customer", "giftgenius.in");
        assertThat(a).isEqualTo(EmailOutboxSender.messageId(5, "order:42:confirmed:customer", "giftgenius.in"));
        assertThat(a).isNotEqualTo(EmailOutboxSender.messageId(6, "order:42:confirmed:customer", "giftgenius.in"))
                .isNotEqualTo(EmailOutboxSender.messageId(5, "order:42:confirmed:seller:7", "giftgenius.in"));
    }

    @Test
    void theMessageIdUsesTheFromAddressDomain() {
        assertThat(EmailOutboxSender.domainOf("GiftGenius <no-reply@GiftGenius.in>")).isEqualTo("giftgenius.in");
        assertThat(EmailOutboxSender.domainOf("not an address")).isEqualTo("giftgenius.local");
        assertThat(EmailOutboxSender.domainOf(null)).isEqualTo("giftgenius.local");
    }

    /** Spring's real sender, over a connection that records what it would have sent instead of opening a socket. */
    static final class RecordingTransportSender extends JavaMailSenderImpl {
        final List<Message> sent = new CopyOnWriteArrayList<>();

        RecordingTransportSender() {
            setHost("smtp.invalid");
        }

        @Override
        protected Transport getTransport(Session session) {
            return new Transport(session, new URLName("smtp://smtp.invalid")) {
                @Override
                protected boolean protocolConnect(String host, int port, String user, String password) {
                    return true;
                }

                @Override
                public void sendMessage(Message message, Address[] addresses) {
                    sent.add(message);
                }
            };
        }
    }

    @Test
    void springsRealSenderKeepsTheMessageIdOnEverySend() throws Exception {
        RecordingTransportSender real = new RecordingTransportSender();
        EmailOutboxSender s = sender(real, TestProps.outbox());
        s.deliver(claimed(1));
        s.deliver(claimed(2)); // a retry of the same email
        assertThat(real.sent).hasSize(2);
        String expected = EmailOutboxSender.messageId(5, "order:42:confirmed:customer", "giftgenius.local");
        for (Message m : real.sent) {
            assertThat(m.getHeader("Message-ID")).containsExactly(expected);
        }
    }

    @Test
    void withoutAProviderNothingIsSentAndItIsRecordedAsNotSent() {
        sender(null, TestProps.outbox()).deliver(claimed(1));
        verify(store).markNotSent(5, EmailOutboxSender.NO_PROVIDER);
        verify(store, never()).markSent(anyLong());
    }

    @Test
    void failuresAreRetriedAfterEachConfiguredDelayThenGivenUp() {
        doThrow(new MailSendException("Connection refused")).when(smtp).send(any(MimeMessage.class));
        EmailOutboxSender s = sender();
        List<Duration> delays = TestProps.outbox().retryDelays();
        for (int attempt = 1; attempt <= delays.size(); attempt++) {
            s.deliver(claimed(attempt));
            verify(store).markRetry(eq(5L), eq(delays.get(attempt - 1)), anyString());
        }
        s.deliver(claimed(delays.size() + 1));
        verify(store).markFailed(eq(5L), anyString());
        verify(store, never()).markSent(anyLong());
        assertThat(s.maxAttempts()).isEqualTo(5);
    }

    @Test
    void anAuthenticationFailureIsRetriedSinceFixingTheSettingsFixesIt() {
        doThrow(new MailAuthenticationException("535 Authentication failed")).when(smtp).send(any(MimeMessage.class));
        sender().deliver(claimed(1));
        verify(store).markRetry(eq(5L), eq(Duration.ofMinutes(1)), anyString());
    }

    @Test
    void errorsRetryingCantFixFailAtOnce() throws Exception {
        doThrow(new MailParseException("Illegal address")).when(smtp).send(any(MimeMessage.class));
        sender().deliver(claimed(1));
        verify(store).markFailed(eq(5L), anyString());

        SendFailedException refused = new SendFailedException("550 No such user", null, new jakarta.mail.Address[0],
                new jakarta.mail.Address[0], new jakarta.mail.Address[] { new InternetAddress("x@example.com") });
        assertThat(EmailOutboxSender.isPermanent(new MailSendException(Map.<Object, Exception>of(new Object(), refused)))).isTrue();
        assertThat(EmailOutboxSender.isPermanent(new MailSendException("Connection timed out"))).isFalse();
    }

    @Test
    void storedErrorsCarryNoAddressesAndFitTheColumn() {
        String described = EmailOutboxSender.describe(
                new MailSendException("550 5.1.1 <asha.rao@example.com>: Recipient address rejected\r\nmore " + "x".repeat(900)));
        assertThat(described).startsWith("MailSendException: 550 5.1.1").doesNotContain("asha.rao@example.com")
                .contains("a***@example.com").doesNotContain("\n").doesNotContain("\r");
        assertThat(described.length()).isLessThanOrEqualTo(EmailOutboxSender.MAX_ERROR);
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void logsNeverShowTheRecipient(CapturedOutput output) {
        doThrow(new MailSendException("refused for asha.rao@example.com")).when(smtp).send(any(MimeMessage.class));
        sender().deliver(claimed(1));
        sender(null, TestProps.outbox()).deliver(claimed(1));
        assertThat(output).contains("a***@example.com").doesNotContain("asha.rao@example.com");
    }

    @Test
    void aPassGivesUpOnInterruptedEmailsFirstAndStopsAtTheBatchSize() {
        AppProperties.Outbox small = new AppProperties.Outbox(true, Duration.ofSeconds(15), Duration.ofMinutes(5), 3,
                List.of(Duration.ofMinutes(1)));
        when(store.claimNext(any())).thenReturn(Optional.of(claimed(1)));
        int attempted = sender(smtp, small).passOnce();
        assertThat(attempted).isEqualTo(3);
        InOrder order = inOrder(store);
        order.verify(store).failInterrupted();
        order.verify(store, times(3)).claimNext(Duration.ofMinutes(5));
    }

    @Test
    void drainKeepsGoingUntilNothingIsDue() {
        AppProperties.Outbox small = new AppProperties.Outbox(true, Duration.ofSeconds(15), Duration.ofMinutes(5), 2,
                List.of(Duration.ofMinutes(1)));
        when(store.claimNext(any())).thenReturn(Optional.of(claimed(1)), Optional.of(claimed(1)), Optional.of(claimed(1)),
                Optional.empty());
        sender(smtp, small).drain();
        verify(smtp, times(3)).send(any(MimeMessage.class));
    }

    @Test
    void aDatabaseOutageStopsThePassWithoutMarkingAnything() {
        when(store.failInterrupted()).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("down"));
        sender().drain();
        verifyNoInteractions(smtp);
        verify(store, never()).markSent(anyLong());
    }

    @Test
    void withTheSenderSwitchedOffNothingIsTriggered() {
        AppProperties.Outbox off = new AppProperties.Outbox(false, Duration.ofSeconds(15), Duration.ofMinutes(5), 20,
                List.of(Duration.ofMinutes(1)));
        TaskExecutor executor = mock(TaskExecutor.class);
        EmailOutboxSender s = new EmailOutboxSender(store, () -> smtp, executor, "x@example.com", off);
        s.onQueued(new EmailOutbox.Queued());
        s.poll();
        verifyNoInteractions(executor, store, smtp);
    }
}
