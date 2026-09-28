package com.giftgenius.location;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.location.LocationDtos.Address;
import com.giftgenius.location.LocationDtos.ReverseRequest;

import jakarta.validation.Valid;

/**
 * Checkout's "Use my current location". Signed-in shoppers only (checkout requires an account), and
 * rate-limited per client IP like other public lookups.
 */
@RestController
@RequestMapping("/api/location")
public class LocationController {

    private final ReverseGeocoder geocoder;

    public LocationController(ReverseGeocoder geocoder) {
        this.geocoder = geocoder;
    }

    @PostMapping("/reverse")
    public Address reverse(@Valid @RequestBody ReverseRequest request) {
        return geocoder.reverse(request.latitude(), request.longitude());
    }
}
