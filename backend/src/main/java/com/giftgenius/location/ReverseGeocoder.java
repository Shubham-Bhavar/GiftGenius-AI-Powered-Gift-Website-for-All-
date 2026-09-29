package com.giftgenius.location;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.giftgenius.common.ApiException;
import com.giftgenius.config.AppProperties;
import com.giftgenius.location.LocationDtos.Address;

import tools.jackson.databind.JsonNode;

/**
 * Turns coordinates into address parts using a Nominatim-compatible service (OpenStreetMap by default).
 *
 * <p>Privacy: coordinates are rounded to 5 decimals (about 1 m) before leaving the server, are never
 * logged or stored, and only the resulting address parts are cached (by rounded coordinate, in memory).
 * Usage policy: at most one upstream request per second, a User-Agent that identifies the app, and results
 * reused from the cache.
 */
@Service
public class ReverseGeocoder {

    private static final Logger log = LoggerFactory.getLogger(ReverseGeocoder.class);
    private static final int CACHE_SIZE = 500;
    private static final Duration CACHE_TTL = Duration.ofHours(24);
    static final long MIN_INTERVAL_MS = 1100;
    private static final long MAX_WAIT_MS = 2500;

    private final RestClient http;
    private final AppProperties.Geo props;
    private final String userAgent;
    private final String referer;
    private final Map<String, Cached> cache = new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
            return size() > CACHE_SIZE;
        }
    };
    private long nextSlotMs;

    private record Cached(Address address, Instant at) {
    }

    public ReverseGeocoder(@Qualifier("geocoderRestClient") RestClient http, AppProperties properties) {
        this.http = http;
        this.props = properties.geo();
        String publicUrl = properties.publicUrl() == null ? "" : properties.publicUrl();
        this.referer = publicUrl;
        this.userAgent = props != null && StringUtils.hasText(props.userAgent()) ? props.userAgent()
                : "GiftGenius/2.0 (address autofill; +" + publicUrl + ")";
    }

    public boolean isEnabled() {
        return props != null && props.enabled();
    }

    public Address reverse(double latitude, double longitude) {
        if (!isEnabled()) {
            throw ApiException.unavailable("Location lookup isn't available right now. Please enter your address manually.");
        }
        double lat = round5(latitude);
        double lon = round5(longitude);
        String key = lat + "," + lon;
        Address cached = fromCache(key);
        if (cached != null) {
            return cached;
        }

        waitForSlot();
        JsonNode body;
        try {
            body = http.get()
                    .uri(u -> u.path("/reverse")
                            .queryParam("format", "jsonv2")
                            .queryParam("lat", lat)
                            .queryParam("lon", lon)
                            .queryParam("zoom", 18)
                            .queryParam("addressdetails", 1)
                            .build())
                    .header("User-Agent", userAgent)
                    .header("Referer", referer)
                    .header("Accept-Language", "en")
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException e) {
            // Deliberately no coordinates in the log.
            log.warn("Reverse geocoding failed: {}", e.getClass().getSimpleName());
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "We couldn't look up your location. Please enter your address manually.");
        }

        Address address = toAddress(body);
        if (address == null) {
            throw ApiException.notFound("We couldn't find an address for your location. Please enter it manually.");
        }
        synchronized (cache) {
            cache.put(key, new Cached(address, Instant.now()));
        }
        return address;
    }

    /**
     * Maps a Nominatim {@code jsonv2} response to address parts; null when there is no address.
     *
     * <p>Indian addresses come back at different administrative levels, e.g. (real responses):
     * <ul>
     *   <li>city: {@code suburb=Shivajinagar, city=Pune, county="Pune City Subdistrict", state_district="Pune District"}</li>
     *   <li>town: {@code town=Sangamner, county=Sangamner, state_district="Ahilyanagar District"}</li>
     *   <li>village: {@code road=SH46, village=Dhandharphal, county=Sangamner, state_district="Ahilyanagar District"}</li>
     * </ul>
     * So the city is the city/town/municipality when there is one; for a village the village is the locality
     * and the city is its taluka ("county"), else its district. Only fields that are present are used.
     */
    static Address toAddress(JsonNode body) {
        JsonNode a = body == null ? null : body.get("address");
        if (a == null || !a.isObject()) {
            return null;
        }
        String line = join(text(a, "house_number"), first(a, "road", "pedestrian", "footway"));
        String cityLike = first(a, "city", "town", "municipality");
        String village = first(a, "village", "hamlet");
        String locality = first(a, "suburb", "neighbourhood", "quarter", "city_district", "residential");
        String adminArea = firstNonNull(withoutSuffix(text(a, "county")), withoutSuffix(text(a, "state_district")));
        String city;
        String area;
        if (cityLike != null) {
            city = cityLike;
            area = locality != null ? locality : village;
        } else if (village != null) {
            city = adminArea != null ? adminArea : village;
            area = village;
        } else {
            city = adminArea;
            area = locality;
        }
        if (area != null && area.equalsIgnoreCase(city)) {
            area = null;
        }
        String postcode = text(a, "postcode");
        if (postcode != null) {
            postcode = postcode.replaceAll("\\s+", "");
        }
        String code = text(a, "country_code");
        Address address = new Address(cap(line, 200), cap(area, 100), cap(city, 80), cap(text(a, "state"), 80),
                cap(postcode, 12), cap(text(a, "country"), 80), code == null ? null : code.toUpperCase(Locale.ROOT));
        boolean empty = address.line() == null && address.area() == null && address.city() == null
                && address.state() == null && address.postcode() == null;
        return empty ? null : address;
    }

    private Address fromCache(String key) {
        synchronized (cache) {
            Cached c = cache.get(key);
            if (c == null) {
                return null;
            }
            if (c.at().plus(CACHE_TTL).isBefore(Instant.now())) {
                cache.remove(key);
                return null;
            }
            return c.address();
        }
    }

    /** Keeps upstream calls at least MIN_INTERVAL_MS apart; asks the shopper to retry rather than queue for long. */
    private void waitForSlot() {
        long waitMs;
        synchronized (this) {
            long now = System.currentTimeMillis();
            long slot = Math.max(now, nextSlotMs);
            waitMs = slot - now;
            if (waitMs > MAX_WAIT_MS) {
                throw ApiException.unavailable("Location lookup is busy. Please try again in a moment.");
            }
            nextSlotMs = slot + MIN_INTERVAL_MS;
        }
        if (waitMs > 0) {
            try {
                Thread.sleep(waitMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw ApiException.unavailable("Location lookup was interrupted. Please try again.");
            }
        }
    }

    /** About 1 m: precise enough for the right street, without passing on the device's full precision. */
    static double round5(double v) {
        return Math.round(v * 100_000d) / 100_000d;
    }

    /** "Pune City Subdistrict" → "Pune City", "Ahilyanagar District" → "Ahilyanagar". */
    static String withoutSuffix(String s) {
        if (s == null) {
            return null;
        }
        String cleaned = s.replaceFirst("(?i)\\s+(sub-?district|taluka|tehsil|tahsil|district)$", "").trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static String firstNonNull(String a, String b) {
        return a != null ? a : b;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        String s = v.asString("").trim();
        return s.isEmpty() ? null : s;
    }

    private static String first(JsonNode node, String... fields) {
        for (String f : fields) {
            String v = text(node, f);
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    private static String join(String a, String b) {
        if (a == null) {
            return b;
        }
        return b == null ? a : a + " " + b;
    }

    private static String cap(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max).trim();
    }
}
