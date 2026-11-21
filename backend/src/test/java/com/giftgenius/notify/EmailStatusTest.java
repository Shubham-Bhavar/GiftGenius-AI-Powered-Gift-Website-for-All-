package com.giftgenius.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import com.giftgenius.notify.EmailStatus.Shown;

/**
 * GG-53: what a page may say about an email, from the outbox row and whether a provider is configured. "Sent" only
 * once the mail server accepted it; nothing is ever called sent without a provider.
 */
class EmailStatusTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    private Optional<Shown> statusWith(String row, String smtpHost) {
        when(jdbc.queryForList(anyString(), eq(String.class), eq("order:1:confirmed:customer")))
                .thenReturn(row == null ? List.of() : List.of(row));
        return new EmailStatus(jdbc, smtpHost).of("order:1:confirmed:customer");
    }

    @Test
    void withAProviderEachOutboxStateIsReportedAsItIs() {
        assertThat(statusWith("PENDING", "smtp.example.com")).contains(Shown.SENDING);
        assertThat(statusWith("SENDING", "smtp.example.com")).contains(Shown.SENDING);
        assertThat(statusWith("SENT", "smtp.example.com")).contains(Shown.SENT);
        assertThat(statusWith("FAILED", "smtp.example.com")).contains(Shown.FAILED);
        assertThat(statusWith("NOT_SENT", "smtp.example.com")).contains(Shown.NOT_SENT);
    }

    @Test
    void withoutAProviderNothingIsReportedAsSentOrOnItsWay() {
        for (String row : List.of("PENDING", "SENDING", "SENT", "FAILED", "NOT_SENT")) {
            assertThat(statusWith(row, "")).as(row).contains(Shown.NOT_SENT);
            assertThat(statusWith(row, null)).as(row).contains(Shown.NOT_SENT);
        }
    }

    @Test
    void withNoQueuedEmailNothingIsSaid() {
        assertThat(statusWith(null, "smtp.example.com")).isEmpty();
        assertThat(statusWith(null, "")).isEmpty();
    }
}
