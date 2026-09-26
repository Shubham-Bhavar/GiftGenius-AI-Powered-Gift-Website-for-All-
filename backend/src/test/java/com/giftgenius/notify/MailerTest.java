package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

import com.giftgenius.TestProps;

class MailerTest {

    private final JavaMailSender sender = mock(JavaMailSender.class);

    @SuppressWarnings("unchecked")
    private Mailer mailer(String host) {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        org.mockito.Mockito.when(provider.getIfAvailable()).thenReturn(sender);
        return new Mailer(provider, new SyncTaskExecutor(), TestProps.defaults(), host);
    }

    @AfterEach
    void clearSync() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void blankSmtpHostMeansLogOnlyEvenIfBootCreatedASender() {
        mailer("").send("a@example.com", "Hi", "Body");
        verifyNoInteractions(sender);
    }

    @Test
    void sendsWithTheConfiguredFromAddress() {
        mailer("smtp.example.com").send("a@example.com", "Hi", "Body");
        ArgumentCaptor<SimpleMailMessage> msg = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(msg.capture());
        assertThat(msg.getValue().getTo()).containsExactly("a@example.com");
        assertThat(msg.getValue().getFrom()).isEqualTo("test@giftgenius.local");
    }

    @Test
    void waitsForTheTransactionToCommit() {
        TransactionSynchronizationManager.initSynchronization();
        mailer("smtp.example.com").send("a@example.com", "Order confirmed", "Body");
        verify(sender, never()).send(any(SimpleMailMessage.class));

        TransactionSynchronizationUtils.triggerAfterCommit();
        verify(sender).send(any(SimpleMailMessage.class));
    }
}
