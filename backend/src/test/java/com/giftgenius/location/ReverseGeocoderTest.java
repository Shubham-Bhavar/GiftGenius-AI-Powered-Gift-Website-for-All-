package com.giftgenius.location;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.giftgenius.location.LocationDtos.Address;

import tools.jackson.databind.json.JsonMapper;

/** Mapping checked against real Nominatim {@code jsonv2} responses for Indian addresses. */
class ReverseGeocoderTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static Address map(String json) {
        return ReverseGeocoder.toAddress(JSON.readTree(json));
    }

    @Test
    void mapsACityAddressWithItsStreetAndSuburb() {
        // Shivajinagar, Pune (18.53080, 73.84750)
        Address a = map("""
                {"address":{"road":"Ganeshkhind Road","suburb":"Shivajinagar","city":"Pune",
                 "county":"Pune City Subdistrict","state_district":"Pune District","state":"Maharashtra",
                 "ISO3166-2-lvl4":"IN-MH","postcode":"411001","country":"India","country_code":"in"}}""");
        assertThat(a).isEqualTo(new Address("Ganeshkhind Road", "Shivajinagar", "Pune", "Maharashtra", "411001", "India", "IN"));
    }

    @Test
    void mapsAnIndianCityAddress() {
        Address a = map("""
                {"address":{"house_number":"12","road":"MG Road","suburb":"Shivajinagar","city":"Pune",
                 "state":"Maharashtra","postcode":"411 005","country":"India","country_code":"in"}}""");
        assertThat(a).isEqualTo(new Address("12 MG Road", "Shivajinagar", "Pune", "Maharashtra", "411005", "India", "IN"));
    }

    @Test
    void mapsACityAddressWithoutAStreet() {
        // Near Ghorpuri, Pune (18.51460, 73.88700)
        Address a = map("""
                {"address":{"suburb":"Pune Cantonment","city":"Pune","county":"Pune City Subdistrict",
                 "state_district":"Pune District","state":"Maharashtra","postcode":"411001","country":"India",
                 "country_code":"in"}}""");
        assertThat(a).isEqualTo(new Address(null, "Pune Cantonment", "Pune", "Maharashtra", "411001", "India", "IN"));
    }

    @Test
    void mapsATown() {
        // Sangamner (19.57140, 74.20900)
        Address a = map("""
                {"address":{"town":"Sangamner","county":"Sangamner","state_district":"Ahilyanagar District",
                 "state":"Maharashtra","postcode":"422605","country":"India","country_code":"in"}}""");
        assertThat(a).isEqualTo(new Address(null, null, "Sangamner", "Maharashtra", "422605", "India", "IN"));
    }

    @Test
    void mapsAVillageToItsTalukaNotToTheVillageAsCity() {
        // Dhandharphal, Sangamner taluka (19.53350, 74.16200)
        Address a = map("""
                {"address":{"road":"SH46","village":"Dhandharphal","county":"Sangamner",
                 "state_district":"Ahilyanagar District","state":"Maharashtra","postcode":"422603",
                 "country":"India","country_code":"in"}}""");
        assertThat(a).isEqualTo(new Address("SH46", "Dhandharphal", "Sangamner", "Maharashtra", "422603", "India", "IN"));
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
    void fallsBackToTheDistrictWithoutItsSuffix() {
        Address a = map("""
                {"address":{"hamlet":"Wadi","state_district":"Ahilyanagar District","state":"Maharashtra",
                 "country_code":"in"}}""");
        assertThat(a.city()).isEqualTo("Ahilyanagar");
        assertThat(a.area()).isEqualTo("Wadi");
        assertThat(a.postcode()).isNull();
    }

    @Test
    void keepsHouseNumbersAndNormalisesThePostcode() {
        Address a = map("""
                {"address":{"house_number":"12","road":"MG Road","suburb":"Camp","city":"Pune",
                 "state":"Maharashtra","postcode":"411 001","country_code":"in"}}""");
        assertThat(a.line()).isEqualTo("12 MG Road");
        assertThat(a.postcode()).isEqualTo("411001");
    }

    @Test
    void returnsNullWhenThereIsNoAddress() {
        assertThat(map("{\"error\":\"Unable to geocode\"}")).isNull();
        assertThat(map("{\"address\":{\"country\":\"India\",\"country_code\":\"in\"}}")).isNull();
    }

    @Test
    void stripsAdministrativeSuffixes() {
        assertThat(ReverseGeocoder.withoutSuffix("Pune City Subdistrict")).isEqualTo("Pune City");
        assertThat(ReverseGeocoder.withoutSuffix("Ahilyanagar District")).isEqualTo("Ahilyanagar");
        assertThat(ReverseGeocoder.withoutSuffix("Haveli Taluka")).isEqualTo("Haveli");
        assertThat(ReverseGeocoder.withoutSuffix("Sangamner")).isEqualTo("Sangamner");
    }

    @Test
    void roundsCoordinatesToAboutOneMetre() {
        assertThat(ReverseGeocoder.round5(18.5304123456)).isEqualTo(18.53041);
        assertThat(ReverseGeocoder.round5(-73.847498)).isEqualTo(-73.8475);
    }
}
