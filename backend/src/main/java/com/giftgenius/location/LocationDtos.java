package com.giftgenius.location;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public final class LocationDtos {

    private LocationDtos() {
    }

    /** Sent in the request body (not the URL), so coordinates never end up in proxy access logs. */
    public record ReverseRequest(
            @NotNull(message = "Latitude is missing")
            @DecimalMin(value = "-90", message = "Invalid latitude") @DecimalMax(value = "90", message = "Invalid latitude")
            Double latitude,
            @NotNull(message = "Longitude is missing")
            @DecimalMin(value = "-180", message = "Invalid longitude") @DecimalMax(value = "180", message = "Invalid longitude")
            Double longitude) {
    }

    /**
     * Address parts for the checkout form. Any part may be null. Coordinates are deliberately not echoed back.
     * {@code line} is the street (house number + road), {@code area} the locality/suburb.
     */
    public record Address(String line, String area, String city, String state, String postcode, String country,
            String countryCode) {
    }
}
