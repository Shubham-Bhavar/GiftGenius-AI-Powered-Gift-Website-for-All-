package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import tools.jackson.databind.JsonNode;

class CatalogIT extends AbstractIT {

    @Test
    void seededCatalogIsSearchable() throws Exception {
        JsonNode all = body(mvc.perform(get("/api/products?size=100")).andExpect(status().isOk()).andReturn());
        assertThat(all.path("totalElements").asInt()).isGreaterThanOrEqualTo(20);

        JsonNode flowers = body(mvc.perform(get("/api/products?category=flowers")).andReturn());
        assertThat(flowers.path("content")).allSatisfy(p -> assertThat(p.path("category").asString()).isEqualTo("flowers"));

        JsonNode cheap = body(mvc.perform(get("/api/products?maxPrice=400&sort=price_asc")).andReturn());
        double last = 0;
        for (JsonNode p : cheap.path("content")) {
            double price = p.path("price").asDouble();
            assertThat(price).isLessThanOrEqualTo(400).isGreaterThanOrEqualTo(last);
            last = price;
        }

        JsonNode search = body(mvc.perform(get("/api/products?q=perfume")).andReturn());
        assertThat(search.path("content").get(0).path("name").asString()).containsIgnoringCase("perfume");
    }

    @Test
    void productDetailRelatedAndCategories() throws Exception {
        mvc.perform(get("/api/products/1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Luxury Hamper Box"))
                .andExpect(jsonPath("$.inStock").value(true));
        mvc.perform(get("/api/products/1/related?limit=4")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));
        mvc.perform(get("/api/products/categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].category").exists());
        mvc.perform(get("/api/products/99999")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("We couldn't find that gift."));
    }

    @Test
    void adminCanCreateEditAndDeactivateProducts() throws Exception {
        Session admin = admin();
        Map<String, Object> req = new HashMap<>(Map.of(
                "name", "IT Test Candle", "category", "Home Decor", "description", "A soy candle.",
                "price", 350, "originalPrice", 450, "image", "https://example.com/candle.jpg", "stock", 7,
                "tags", List.of("Candle", "calm"), "occasion", List.of("birthday")));
        JsonNode created = body(mvc.perform(admin.auth(postJson("/api/admin/products", req)))
                .andExpect(status().isCreated()).andReturn());
        long id = created.path("id").asLong();
        assertThat(created.path("slug").asString()).isEqualTo("it-test-candle");
        assertThat(created.path("category").asString()).isEqualTo("home decor");
        assertThat(created.path("tags").toString()).contains("candle");

        req.put("price", 299);
        mvc.perform(admin.auth(put("/api/admin/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(req))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.price").value(299));

        req.put("originalPrice", 100);
        mvc.perform(admin.auth(put("/api/admin/products/" + id).contentType(MediaType.APPLICATION_JSON).content(json(req))))
                .andExpect(status().isBadRequest());

        mvc.perform(admin.auth(delete("/api/admin/products/" + id))).andExpect(status().isNoContent());
        mvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void adminCanManageCoupons() throws Exception {
        Session admin = admin();
        mvc.perform(admin.auth(get("/api/admin/coupons"))).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'WELCOME')].perUserLimit").value(1));

        String code = "IT" + System.nanoTime() % 100000;
        Map<String, Object> req = new HashMap<>(Map.of("code", code, "type", "PERCENT", "discountValue", 10,
                "perUserLimit", 2, "usageLimit", 50));
        JsonNode c = body(mvc.perform(admin.auth(postJson("/api/admin/coupons", req)))
                .andExpect(status().isCreated()).andReturn());
        mvc.perform(admin.auth(postJson("/api/admin/coupons", req))).andExpect(status().isConflict());

        req.put("active", false);
        mvc.perform(admin.auth(put("/api/admin/coupons/" + c.path("id").asLong())
                .contentType(MediaType.APPLICATION_JSON).content(json(req))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));

        req.put("discountValue", 150);
        mvc.perform(admin.auth(postJson("/api/admin/coupons", Map.of("code", code + "X", "type", "PERCENT",
                "discountValue", 150)))).andExpect(status().isBadRequest());
    }

    @Test
    void newsletterSubscriptionIsIdempotent() throws Exception {
        String email = uniqueEmail("news");
        mvc.perform(postJson("/api/newsletter/subscribe", Map.of("email", email))).andExpect(status().isOk());
        mvc.perform(postJson("/api/newsletter/subscribe", Map.of("email", email))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("subscribed"));
    }
}
