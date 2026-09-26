package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MvcResult;

import jakarta.servlet.http.Cookie;

class AuthFlowIT extends AbstractIT {

    private MvcResult refresh(Cookie cookie) throws Exception {
        return mvc.perform(post("/api/auth/refresh").cookie(cookie).header("X-Requested-With", "GiftGenius"))
                .andReturn();
    }

    @Test
    void registerThenReadProfile() throws Exception {
        String email = uniqueEmail("reg");
        Session s = register(email);
        assertThat(s.refreshCookie()).isNotNull();
        assertThat(s.refreshCookie().isHttpOnly()).isTrue();
        assertThat(s.refreshCookie().getPath()).isEqualTo("/api/auth");

        mvc.perform(s.auth(get("/api/auth/me")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("CUSTOMER"));

        mvc.perform(postJson("/api/auth/register",
                Map.of("fullName", "Dup", "email", email.toUpperCase(), "password", "another-password")))
                .andExpect(status().isConflict());
    }

    @Test
    void protectedEndpointsNeedAToken() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in to continue."));
        mvc.perform(get("/api/cart")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/stats").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void customersCannotReachAdminEndpoints() throws Exception {
        Session s = register(uniqueEmail("nonadmin"));
        mvc.perform(s.auth(get("/api/admin/stats"))).andExpect(status().isForbidden());
        mvc.perform(admin().auth(get("/api/admin/stats"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.lowStock").isArray());
    }

    @Test
    void validationErrorsAreReportedPerField() throws Exception {
        mvc.perform(postJson("/api/auth/register", Map.of("fullName", "", "email", "nope", "password", "short")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").value("Enter a valid email"))
                .andExpect(jsonPath("$.errors.password").value("Use 8 to 72 characters"));
    }

    @Test
    void wrongPasswordIsRejected() throws Exception {
        String email = uniqueEmail("wrongpw");
        register(email);
        mvc.perform(postJson("/api/auth/login", Map.of("email", email, "password", "not-the-password")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Incorrect email or password."));
    }

    @Test
    void refreshRequiresTheCsrfHeader() throws Exception {
        Session s = register(uniqueEmail("csrf"));
        mvc.perform(post("/api/auth/refresh").cookie(s.refreshCookie())).andExpect(status().isForbidden());
    }

    @Test
    void refreshRotatesAndToleratesAParallelTabButNotLateReuse() throws Exception {
        Session s = register(uniqueEmail("rotate"));

        MvcResult first = refresh(s.refreshCookie());
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        Cookie rotated = first.getResponse().getCookie("gg_refresh");
        assertThat(rotated.getValue()).isNotEqualTo(s.refreshCookie().getValue());

        // A second tab presents the old cookie a moment later: still accepted (grace window).
        assertThat(refresh(s.refreshCookie()).getResponse().getStatus()).isEqualTo(200);
        // The newest cookie keeps working.
        assertThat(refresh(rotated).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void logoutRevokesTheRefreshToken() throws Exception {
        Session s = register(uniqueEmail("logout"));
        mvc.perform(post("/api/auth/logout").cookie(s.refreshCookie()).header("X-Requested-With", "GiftGenius"))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
        assertThat(refresh(s.refreshCookie()).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void forgotAndResetPassword() throws Exception {
        String email = uniqueEmail("reset");
        Session s = register(email);

        mvc.perform(postJson("/api/auth/password/forgot", Map.of("email", email))).andExpect(status().isAccepted());
        // Unknown emails get the same answer.
        mvc.perform(postJson("/api/auth/password/forgot", Map.of("email", uniqueEmail("ghost"))))
                .andExpect(status().isAccepted());

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(mailer, timeout(2000)).send(eq(email), anyString(), body.capture());
        String token = body.getValue().replaceAll("(?s).*token=([A-Za-z0-9_-]+).*", "$1");

        mvc.perform(postJson("/api/auth/password/reset", Map.of("token", token, "password", "my-new-password-9")))
                .andExpect(status().isNoContent());
        // Single use.
        mvc.perform(postJson("/api/auth/password/reset", Map.of("token", token, "password", "another-password-9")))
                .andExpect(status().isBadRequest());
        // Old sessions are gone; the new password works.
        assertThat(refresh(s.refreshCookie()).getResponse().getStatus()).isEqualTo(401);
        login(email, "my-new-password-9");
    }

    @Test
    void changePasswordAndUpdateProfile() throws Exception {
        String email = uniqueEmail("change");
        Session s = register(email);
        mvc.perform(s.auth(postJson("/api/auth/password/change",
                Map.of("currentPassword", "wrong-password", "newPassword", "changed-password-1"))))
                .andExpect(status().isBadRequest());
        mvc.perform(s.auth(postJson("/api/auth/password/change",
                Map.of("currentPassword", "shopper-password-1", "newPassword", "changed-password-1"))))
                .andExpect(status().isOk());
        Session fresh = login(email, "changed-password-1");

        mvc.perform(fresh.auth(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .patch("/api/auth/me").contentType("application/json")
                .content(json(Map.of("fullName", "Asha R", "phone", "+91 90000 00000")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Asha R"));
    }
}
