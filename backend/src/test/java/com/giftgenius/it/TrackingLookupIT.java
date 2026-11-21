package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/**
 * GG-40: the public order lookup also takes the order number and email in a POST body, so the email isn't written to
 * access logs, browser history or Referer headers. It answers exactly as the original GET form, which still works.
 */
class TrackingLookupIT extends AbstractIT {

    private String placeOrder(Session s) throws Exception {
        addToCart(s, 1, 1);
        return body(mvc.perform(s.auth(postJson("/api/orders", Map.of("shipping", shipping(s.email()),
                "deliveryType", "STANDARD", "paymentMethod", "COD")))
                .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated()).andReturn())
                .path("orderNumber").asString();
    }

    @Test
    void anOrderIsFoundByNumberAndEmailSentInTheBodyWithoutSigningIn() throws Exception {
        Session s = register(uniqueEmail("track-post"));
        String number = placeOrder(s);
        mvc.perform(postJson("/api/orders/track", Map.of("orderNumber", number.toLowerCase(), "email", s.email())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderNumber").value(number))
                .andExpect(jsonPath("$.recipientFirstName").value("Asha"))
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    @Test
    void aWrongEmailAnswersExactlyAsTheGetFormDoes() throws Exception {
        Session s = register(uniqueEmail("track-wrong"));
        String number = placeOrder(s);
        MvcResult post = mvc.perform(postJson("/api/orders/track", Map.of("orderNumber", number,
                "email", "someone-else@example.com"))).andReturn();
        MvcResult viaGet = mvc.perform(get("/api/orders/track").param("orderNumber", number)
                .param("email", "someone-else@example.com")).andReturn();
        assertThat(post.getResponse().getStatus()).isEqualTo(404).isEqualTo(viaGet.getResponse().getStatus());
        assertThat(body(post).path("detail")).isEqualTo(body(viaGet).path("detail"));
    }

    @Test
    void theBodyIsValidated() throws Exception {
        mvc.perform(postJson("/api/orders/track", Map.of("orderNumber", "", "email", "not-an-email")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.orderNumber").exists())
                .andExpect(jsonPath("$.errors.email").exists());
    }

    @Test
    void placingAnOrderStillNeedsASignIn() throws Exception {
        mvc.perform(postJson("/api/orders", Map.of())).andExpect(status().isUnauthorized());
    }
}
