package com.giftgenius.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LogSafeTest {

    @Test
    void anEmailKeepsItsFirstLetterAndDomainOnly() {
        assertThat(LogSafe.email("asha.rao@example.com")).isEqualTo("a***@example.com");
        assertThat(LogSafe.email(" Ravi@Shop.in ")).isEqualTo("R***@Shop.in");
        assertThat(LogSafe.email("not-an-email")).isEqualTo("***");
        assertThat(LogSafe.email("@example.com")).isEqualTo("***");
        assertThat(LogSafe.email(null)).isEqualTo("(none)");
    }

    @Test
    void linkTokensAreRedacted() {
        assertThat(LogSafe.withoutLinkTokens(
                "Open https://shop.example/reset-password?token=abc-123_XYZ to choose a new one.\n"
                        + "Or https://shop.example/x?a=1&token=def456&b=2"))
                .isEqualTo("Open https://shop.example/reset-password?token=[redacted] to choose a new one.\n"
                        + "Or https://shop.example/x?a=1&token=[redacted]&b=2")
                .doesNotContain("abc-123_XYZ").doesNotContain("def456");
        assertThat(LogSafe.withoutLinkTokens("No links here.")).isEqualTo("No links here.");
        assertThat(LogSafe.withoutLinkTokens(null)).isNull();
    }
}
