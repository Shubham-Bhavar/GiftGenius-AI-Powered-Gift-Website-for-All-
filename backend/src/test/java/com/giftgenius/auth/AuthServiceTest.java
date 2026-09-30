package com.giftgenius.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.giftgenius.TestProps;
import com.giftgenius.auth.AuthDtos.IssuedTokens;
import com.giftgenius.auth.AuthDtos.LoginRequest;
import com.giftgenius.auth.AuthDtos.ResetPasswordRequest;
import com.giftgenius.common.ApiException;
import com.giftgenius.notify.Mailer;
import com.giftgenius.security.JwtService;
import com.giftgenius.seller.SellerService;
import com.giftgenius.user.Role;
import com.giftgenius.user.User;
import com.giftgenius.user.UserRepository;

class AuthServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final RefreshTokenRepository refreshTokens = mock(RefreshTokenRepository.class);
    private final PasswordResetTokenRepository resetTokens = mock(PasswordResetTokenRepository.class);
    private final Mailer mailer = mock(Mailer.class);
    private final SellerService sellers = mock(SellerService.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private AuthService auth;
    private User user;

    @BeforeEach
    void setUp() {
        auth = new AuthService(users, refreshTokens, resetTokens, encoder, new JwtService(TestProps.defaults()),
                mailer, sellers, TestProps.defaults());
        user = new User();
        user.setId(5L);
        user.setEmail("asha@example.com");
        user.setFullName("Asha Rao");
        user.setRole(Role.CUSTOMER);
        user.setPasswordHash(encoder.encode("correct horse"));
    }

    private RefreshToken token(Instant revokedAt, Instant rotatedAt) {
        RefreshToken t = new RefreshToken();
        t.setUser(user);
        t.setExpiresAt(Instant.now().plusSeconds(3600));
        t.setRevokedAt(revokedAt);
        t.setRotatedAt(rotatedAt);
        when(refreshTokens.findByTokenHash(AuthService.hash("raw"))).thenReturn(Optional.of(t));
        return t;
    }

    @Test
    void refreshRotatesTheToken() {
        RefreshToken t = token(null, null);
        IssuedTokens issued = auth.refresh("raw");
        assertThat(issued.refreshToken()).isNotBlank().isNotEqualTo("raw");
        assertThat(t.getRevokedAt()).isNotNull();
        assertThat(t.getRotatedAt()).isNotNull();
    }

    @Test
    void recentlyRotatedTokenIsAcceptedOnceMoreForParallelTabs() {
        Instant justNow = Instant.now().minusSeconds(3);
        token(justNow, justNow);
        assertThat(auth.refresh("raw").body().accessToken()).isNotBlank();
        verify(refreshTokens, never()).revokeAllForUser(any(), any());
    }

    @Test
    void reuseAfterGraceRevokesEverySession() {
        Instant old = Instant.now().minusSeconds(120);
        token(old, old);
        assertThatThrownBy(() -> auth.refresh("raw")).isInstanceOf(ApiException.class);
        verify(refreshTokens).revokeAllForUser(eq(5L), any());
    }

    @Test
    void loggedOutTokenIsNeverGivenGrace() {
        token(Instant.now().minusSeconds(1), null);
        assertThatThrownBy(() -> auth.refresh("raw")).isInstanceOf(ApiException.class);
        verify(refreshTokens).revokeAllForUser(eq(5L), any());
    }

    @Test
    void loginFailsTheSameWayForUnknownEmailAndWrongPassword() {
        when(users.findByEmailIgnoreCase("asha@example.com")).thenReturn(Optional.of(user));
        when(users.findByEmailIgnoreCase("nobody@example.com")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> auth.login(new LoginRequest("asha@example.com", "wrong")))
                .hasMessage("Incorrect email or password.");
        assertThatThrownBy(() -> auth.login(new LoginRequest("nobody@example.com", "wrong")))
                .hasMessage("Incorrect email or password.");
        assertThat(auth.login(new LoginRequest("asha@example.com", "correct horse")).body().user().email())
                .isEqualTo("asha@example.com");
    }

    @Test
    void passwordResetEmailsASingleUseLinkAndResetRevokesSessions() {
        when(users.findByEmailIgnoreCase("asha@example.com")).thenReturn(Optional.of(user));
        auth.requestPasswordReset("asha@example.com");

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(mailer).send(eq("asha@example.com"), anyString(), body.capture());
        String raw = body.getValue().replaceAll("(?s).*token=([A-Za-z0-9_-]+).*", "$1");
        ArgumentCaptor<PasswordResetToken> saved = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(resetTokens).save(saved.capture());
        assertThat(saved.getValue().getTokenHash()).isEqualTo(AuthService.hash(raw));

        when(resetTokens.findByTokenHash(AuthService.hash(raw))).thenReturn(Optional.of(saved.getValue()));
        auth.resetPassword(new ResetPasswordRequest(raw, "a brand new password"));
        assertThat(encoder.matches("a brand new password", user.getPasswordHash())).isTrue();
        verify(refreshTokens).revokeAllForUser(eq(5L), any());
    }

    @Test
    void unknownEmailForPasswordResetIsSilent() {
        when(users.findByEmailIgnoreCase(anyString())).thenReturn(Optional.empty());
        auth.requestPasswordReset("nobody@example.com");
        verify(mailer, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void expiredResetTokenIsRejected() {
        PasswordResetToken t = new PasswordResetToken();
        t.setUser(user);
        t.setExpiresAt(Instant.now().minusSeconds(1));
        when(resetTokens.findByTokenHash(AuthService.hash("old"))).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> auth.resetPassword(new ResetPasswordRequest("old", "a brand new password")))
                .hasMessageContaining("expired");
    }
}
