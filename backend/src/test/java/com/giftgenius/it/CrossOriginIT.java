package com.giftgenius.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;

/**
 * Which browser sites may call the API, and what needs no sign-in. Only the sites listed in
 * app.security.allowed-origins (CORS_ALLOWED_ORIGINS) may call it cross-origin. Any other site, such as a Vercel
 * preview that isn't listed, is refused with 403 before anything else, and the browser then reports the request as
 * unreachable ("We couldn't reach GiftGenius"), even for the public catalogue.
 */
class CrossOriginIT extends AbstractIT {

    private static final String UNLISTED_PREVIEW = "https://giftgenius-git-some-branch-team.vercel.app";

    @Test
    void theConfiguredSiteMayReadThePublicCatalogueWithCookies() throws Exception {
        mvc.perform(get("/api/products").param("size", "100").header(HttpHeaders.ORIGIN, SITE_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, SITE_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }

    @Test
    void aSiteThatIsNotListedIsRefusedEvenForThePublicCatalogue() throws Exception {
        mvc.perform(get("/api/products").param("size", "100").header(HttpHeaders.ORIGIN, UNLISTED_PREVIEW))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .andExpect(content().string("Invalid CORS request"));
    }

    @Test
    void theSignInRefreshPreflightIsAllowedOnlyForTheConfiguredSite() throws Exception {
        mvc.perform(options("/api/auth/refresh").header(HttpHeaders.ORIGIN, SITE_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "x-requested-with"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, SITE_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
        mvc.perform(options("/api/auth/refresh").header(HttpHeaders.ORIGIN, UNLISTED_PREVIEW)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "x-requested-with"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @ParameterizedTest
    @ValueSource(strings = { "/api/products?size=100", "/api/products/categories", "/api/search?q=perfume",
            "/api/checkout/options" })
    void theCatalogueNeedsNoSignIn(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = { "/", "/api", "/api/auth/me", "/api/cart", "/api/wishlist", "/api/orders",
            "/api/admin/orders", "/api/admin/stats", "/api/seller/me", "/api/seller/products" })
    void everythingElseNeedsSignIn(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
    }
}
