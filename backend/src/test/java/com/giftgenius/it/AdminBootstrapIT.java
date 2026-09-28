package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.giftgenius.auth.PasswordResetTokenRepository;
import com.giftgenius.auth.RefreshTokenRepository;
import com.giftgenius.config.AdminBootstrap;
import com.giftgenius.config.AppProperties;
import com.giftgenius.user.UserRepository;

/** ADMIN_EMAIL / ADMIN_PASSWORD at startup, including an email that already belongs to a customer. */
class AdminBootstrapIT extends AbstractIT {

    private static final String NEW_ADMIN_PASSWORD = "configured-admin-pass-9";

    @Autowired
    AppProperties properties;
    @Autowired
    UserRepository users;
    @Autowired
    PasswordEncoder encoder;
    @Autowired
    RefreshTokenRepository refreshTokens;
    @Autowired
    PasswordResetTokenRepository resetTokens;
    @Autowired
    PlatformTransactionManager txManager;

    /** Runs the startup bootstrap for a given ADMIN_EMAIL / ADMIN_PASSWORD, in a transaction as at startup. */
    private void bootstrap(String email, String password) {
        AppProperties p = new AppProperties(properties.publicUrl(), properties.security(), properties.ai(),
                properties.payment(), properties.shipping(), new AppProperties.Admin(email, password, "Store Owner"),
                properties.rateLimit(), properties.orders(), properties.mail(), properties.geo());
        AdminBootstrap bootstrap = new AdminBootstrap(p, users, encoder, refreshTokens, resetTokens);
        new TransactionTemplate(txManager).executeWithoutResult(status -> bootstrap.run(null));
    }

    @Test
    void configuredAdminCanUseAdminApisAndCustomersCannot() throws Exception {
        mvc.perform(admin().auth(get("/api/admin/stats"))).andExpect(status().isOk());
        Session customer = register(uniqueEmail("not-admin"));
        mvc.perform(customer.auth(get("/api/admin/stats"))).andExpect(status().isForbidden());
        mvc.perform(customer.auth(get("/api/admin/orders"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/stats")).andExpect(status().isUnauthorized());
    }

    @Test
    void promotesAnExistingCustomerAccountAndTakesItOverWithTheConfiguredPassword() throws Exception {
        String email = uniqueEmail("owner");
        Session before = register(email); // signed up in the shop first, with the shopper password
        mvc.perform(before.auth(get("/api/admin/stats"))).andExpect(status().isForbidden());

        bootstrap(email.toUpperCase(), NEW_ADMIN_PASSWORD);

        assertThat(users.findByEmailIgnoreCase(email).orElseThrow().getRole().name()).isEqualTo("ADMIN");
        // The old password and the old session no longer work: only the ADMIN_PASSWORD holder gets in.
        mvc.perform(postJson("/api/auth/login", Map.of("email", email, "password", "shopper-password-1")))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").cookie(before.refreshCookie()).header("X-Requested-With", "GiftGenius"))
                .andExpect(status().isUnauthorized());
        Session admin = login(email, NEW_ADMIN_PASSWORD);
        mvc.perform(admin.auth(get("/api/auth/me"))).andExpect(jsonPath("$.role").value("ADMIN"));
        mvc.perform(admin.auth(get("/api/admin/stats"))).andExpect(status().isOk());
    }

    @Test
    void leavesAnExistingAdminAlone() throws Exception {
        String email = uniqueEmail("admin-twice");
        bootstrap(email, NEW_ADMIN_PASSWORD);
        Session s = login(email, NEW_ADMIN_PASSWORD);
        mvc.perform(s.auth(postJson("/api/auth/password/change",
                Map.of("currentPassword", NEW_ADMIN_PASSWORD, "newPassword", "changed-later-pass-1"))))
                .andExpect(status().isOk());

        bootstrap(email, NEW_ADMIN_PASSWORD); // e.g. the next deploy restarts the app

        login(email, "changed-later-pass-1"); // the admin's own later password still works
        mvc.perform(postJson("/api/auth/login", Map.of("email", email, "password", NEW_ADMIN_PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refusesAShortAdminPassword() throws Exception {
        String email = uniqueEmail("weak");
        register(email);
        bootstrap(email, "too-short");
        assertThat(users.findByEmailIgnoreCase(email).orElseThrow().getRole().name()).isEqualTo("CUSTOMER");
        String other = uniqueEmail("weak-new");
        bootstrap(other, "too-short");
        assertThat(users.findByEmailIgnoreCase(other)).isEmpty();
    }
}
