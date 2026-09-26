package com.giftgenius.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.giftgenius.TestProps;
import com.giftgenius.config.AppProperties;
import com.giftgenius.user.Role;
import com.giftgenius.user.User;

class JwtServiceTest {

    private static AppProperties props(String secret) {
        return TestProps.withSecurity(TestProps.security(secret));
    }

    @Test
    void roundTripsUserClaims() {
        JwtService jwt = new JwtService(props("a-very-long-test-secret-of-at-least-32-bytes!"));
        User u = new User();
        u.setId(42L);
        u.setEmail("asha@example.com");
        u.setRole(Role.ADMIN);

        AuthUser parsed = jwt.verify(jwt.issueAccessToken(u)).orElseThrow();
        assertThat(parsed.id()).isEqualTo(42L);
        assertThat(parsed.email()).isEqualTo("asha@example.com");
        assertThat(parsed.isAdmin()).isTrue();
    }

    @Test
    void rejectsTamperedToken() {
        JwtService jwt = new JwtService(props("a-very-long-test-secret-of-at-least-32-bytes!"));
        User u = new User();
        u.setId(1L);
        u.setEmail("x@example.com");
        u.setRole(Role.CUSTOMER);
        String token = jwt.issueAccessToken(u);
        assertThat(jwt.verify(token.substring(0, token.length() - 2) + "xx")).isEmpty();
    }

    @Test
    void refusesShortSecret() {
        assertThatThrownBy(() -> new JwtService(props("short"))).isInstanceOf(IllegalStateException.class);
    }
}
