package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class LocationIT extends AbstractIT {

    @AfterEach
    void reset() {
        GEO_MODE.set("ok");
    }

    @Test
    void reverseGeocodingNeedsASignedInShopper() throws Exception {
        mvc.perform(postJson("/api/location/reverse", Map.of("latitude", 18.52, "longitude", 73.85)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void returnsAddressPartsAndSendsOnlyRoundedCoordinates() throws Exception {
        Session s = register(uniqueEmail("geo"));
        mvc.perform(s.auth(postJson("/api/location/reverse", Map.of("latitude", 18.5304123456, "longitude", 73.8474987654))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.line").value("12 MG Road"))
                .andExpect(jsonPath("$.area").value("Shivajinagar"))
                .andExpect(jsonPath("$.city").value("Pune"))
                .andExpect(jsonPath("$.state").value("Maharashtra"))
                .andExpect(jsonPath("$.postcode").value("411005"))
                .andExpect(jsonPath("$.countryCode").value("IN"))
                .andExpect(jsonPath("$.latitude").doesNotExist());

        String[] upstream = GEO_LAST_REQUEST.get();
        assertThat(upstream[0]).contains("lat=18.5304").contains("lon=73.8475").doesNotContain("18.53041");
        assertThat(upstream[1]).startsWith("GiftGenius/");
    }

    @Test
    void validatesCoordinates() throws Exception {
        Session s = register(uniqueEmail("geo-bad"));
        mvc.perform(s.auth(postJson("/api/location/reverse", Map.of("latitude", 123.0, "longitude", 73.8))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.latitude").value("Invalid latitude"));
    }

    @Test
    void explainsWhenTheLookupFailsOrFindsNothing() throws Exception {
        Session s = register(uniqueEmail("geo-fail"));
        GEO_MODE.set("down");
        mvc.perform(s.auth(postJson("/api/location/reverse", Map.of("latitude", 10.1111, "longitude", 76.2222))))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("We couldn't look up your location. Please enter your address manually."));

        GEO_MODE.set("empty");
        mvc.perform(s.auth(postJson("/api/location/reverse", Map.of("latitude", 0.0, "longitude", -30.0))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("We couldn't find an address for your location. Please enter it manually."));
    }
}
