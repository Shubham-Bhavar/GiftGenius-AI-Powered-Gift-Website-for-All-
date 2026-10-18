package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** GET /api/search: public, gift-aware search over what can be bought right now. */
class SearchIT extends AbstractIT {

    private JsonNode search(String q) throws Exception {
        return body(mvc.perform(get("/api/search").param("q", q)).andExpect(status().isOk()).andReturn());
    }

    @Test
    void anyoneCanSearchByProductWords() throws Exception {
        JsonNode res = search("perfume");
        assertThat(res.path("query").asString()).isEqualTo("perfume");
        assertThat(res.path("results").path("content").get(0).path("product").path("name").asString())
                .isEqualTo("Signature Perfume");
        assertThat(res.path("results").path("content").get(0).path("score").asDouble()).isPositive();
    }

    @Test
    void aGiftRequestIsUnderstoodAndTheBudgetIsAHardLimit() throws Exception {
        JsonNode res = search("birthday gift for my mom under 1000");
        assertThat(res.path("interpreted").path("recipient").asString()).isEqualTo("parent");
        assertThat(res.path("interpreted").path("occasion").asString()).isEqualTo("birthday");
        assertThat(res.path("interpreted").path("budget").asInt()).isEqualTo(1000);
        assertThat(res.path("results").path("content")).isNotEmpty();
        for (JsonNode hit : res.path("results").path("content")) {
            assertThat(hit.path("product").path("price").asDouble()).isLessThanOrEqualTo(1000 * 1.15);
            assertThat(hit.path("product").path("inStock").asBoolean()).isTrue();
        }
    }

    @Test
    void noMatchesIsAnEmptyPage() throws Exception {
        JsonNode res = search("spaceship");
        assertThat(res.path("results").path("content")).isEmpty();
        assertThat(res.path("results").path("totalElements").asLong()).isZero();
    }

    @Test
    void aSearchNeedsWordsAndNotTooMany() throws Exception {
        mvc.perform(get("/api/search")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/search").param("q", "   ")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/search").param("q", "x".repeat(201))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Keep your search under 200 characters."));
    }

    @Test
    void theCatalogueListingIsUnchanged() throws Exception {
        // /api/products?q is still a plain text filter over the listing, with its own page shape.
        JsonNode listing = body(mvc.perform(get("/api/products").param("q", "perfume")).andExpect(status().isOk()).andReturn());
        assertThat(listing.path("content").get(0).path("name").asString()).isEqualTo("Signature Perfume");
        assertThat(listing.has("totalElements")).isTrue();
        assertThat(listing.has("interpreted")).isFalse();
    }
}
