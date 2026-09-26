package com.giftgenius.payment;

import java.math.BigDecimal;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import tools.jackson.databind.JsonNode;
import com.giftgenius.common.ApiException;
import com.giftgenius.config.AppProperties;

@Component
public class RazorpayClient {

    private static final Logger log = LoggerFactory.getLogger(RazorpayClient.class);

    public record RazorpayOrder(String id, long amountPaise, String currency) {
    }

    private final RestClient http;
    private final AppProperties.Payment props;

    public RazorpayClient(@Qualifier("razorpayRestClient") RestClient http, AppProperties properties) {
        this.http = http;
        this.props = properties.payment();
    }

    public boolean isEnabled() {
        return props.razorpayEnabled() && StringUtils.hasText(props.razorpayKeyId())
                && StringUtils.hasText(props.razorpayKeySecret());
    }

    public String keyId() {
        return props.razorpayKeyId();
    }

    public String keySecret() {
        return props.razorpayKeySecret();
    }

    public String webhookSecret() {
        return props.razorpayWebhookSecret();
    }

    public RazorpayOrder createOrder(BigDecimal amountInr, String receipt) {
        long paise = amountInr.movePointRight(2).longValueExact();
        try {
            JsonNode res = http.post()
                    .uri("/v1/orders")
                    .headers(h -> h.setBasicAuth(props.razorpayKeyId(), props.razorpayKeySecret()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("amount", paise, "currency", "INR", "receipt", receipt))
                    .retrieve()
                    .body(JsonNode.class);
            if (res == null || !res.hasNonNull("id")) {
                throw new RestClientException("Empty response");
            }
            return new RazorpayOrder(res.get("id").asString(), res.path("amount").asLong(paise),
                    res.path("currency").asString("INR"));
        } catch (RestClientException e) {
            log.error("Razorpay order creation failed for {}: {}", receipt, e.getMessage());
            throw ApiException.unavailable("Online payment is temporarily unavailable. Try again or choose Cash on Delivery.");
        }
    }
}
