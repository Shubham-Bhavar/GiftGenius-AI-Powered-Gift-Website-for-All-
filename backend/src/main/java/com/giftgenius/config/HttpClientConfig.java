package com.giftgenius.config;

import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Configuration
public class HttpClientConfig {

    @Bean
    public RestClient geminiRestClient(RestClient.Builder builder, AppProperties properties) {
        return builder.clone()
                .baseUrl(properties.ai().baseUrl())
                .requestFactory(factory(Duration.ofSeconds(5), properties.ai().timeout()))
                .build();
    }

    @Bean
    public RestClient razorpayRestClient(RestClient.Builder builder, AppProperties properties) {
        return builder.clone()
                .baseUrl(properties.payment().razorpayBaseUrl())
                .requestFactory(factory(Duration.ofSeconds(5), Duration.ofSeconds(15)))
                .build();
    }

    @Bean
    public RestClient geocoderRestClient(RestClient.Builder builder, AppProperties properties) {
        AppProperties.Geo geo = properties.geo();
        // A blank GEOCODER_BASE_URL (e.g. copied from .env.example) means "use the default".
        String baseUrl = geo != null && StringUtils.hasText(geo.baseUrl()) ? geo.baseUrl() : "https://nominatim.openstreetmap.org";
        Duration timeout = geo != null && geo.timeout() != null ? geo.timeout() : Duration.ofSeconds(8);
        return builder.clone()
                .baseUrl(baseUrl)
                .requestFactory(factory(Duration.ofSeconds(4), timeout))
                .build();
    }

    private static SimpleClientHttpRequestFactory factory(Duration connect, Duration read) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(connect);
        f.setReadTimeout(read);
        return f;
    }
}
