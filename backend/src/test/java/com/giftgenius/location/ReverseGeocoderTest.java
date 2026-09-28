package com.giftgenius.location;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.giftgenius.location.LocationDtos.Address;

import tools.jackson.databind.json.JsonMapper;

class ReverseGeocoderTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static Address map(String json) {
        return ReverseGeocoder.toAddress(JSON.readTree(json));
    }

    @Test
    void mapsAnIndianCityAddress() {
        Address a = map("""
                {"address":{"house_number":"12","road":"MG Road","suburb":"Shivajinagar","city":"Pune",
                 "state":"Maharashtra","postcode":"411 005","country":"India","country_code":"in"}}""");
        assertThat(a).isEqualTo(new Address("12 MG Road", "Shivajinagar", "Pune", "Maharashtra", "411005", "India", "IN"));
    }

    @Test
    void fallsBackToTownOrVillageAndDropsAnAreaThatRepeatsTheCity() {
        Address a = map("""
                {"address":{"road":"Station Road","village":"Sangamner","suburb":"Sangamner",
                 "state":"Maharashtra","postcode":"422605","country_code":"in"}}""");
        assertThat(a.city()).isEqualTo("Sangamner");
        assertThat(a.area()).isNull();
        assertThat(a.line()).isEqualTo("Station Road");
    }

    @Test
    void returnsNullWhenThereIsNoAddress() {
        assertThat(map("{\"error\":\"Unable to geocode\"}")).isNull();
        assertThat(map("{\"address\":{\"country\":\"India\",\"country_code\":\"in\"}}")).isNull();
    }

    @Test
    void roundsCoordinatesToAboutElevenMetres() {
        assertThat(ReverseGeocoder.round4(18.5304123456)).isEqualTo(18.5304);
        assertThat(ReverseGeocoder.round4(-73.84749)).isEqualTo(-73.8475);
    }
}
