package com.giftgenius.ai.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.giftgenius.ai.service.AiOutputValidator.ModelPick;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AiOutputValidatorTest {

    private final AiOutputValidator validator = new AiOutputValidator(JsonMapper.builder().build());

    private JsonNode object(String raw) {
        return validator.object(raw).orElseThrow();
    }

    @Test
    void anObjectWithOrWithoutACodeFence() {
        assertThat(validator.object("{\"a\":1}")).isPresent();
        assertThat(validator.object("```json\n{\"a\":1}\n```")).isPresent();
        assertThat(validator.object("  ```\n{\"a\":1}```  ")).isPresent();
    }

    @ParameterizedTest
    @ValueSource(strings = { "not json", "[1,2]", "\"text\"", "42", "", "{\"a\":" })
    void anythingElseIsNoAnswer(String raw) {
        assertThat(validator.object(raw)).isEmpty();
        assertThat(validator.object(null)).isEmpty();
    }

    @Test
    void onlyAllowListedProductsEachOnceInTheModelsOrderUpToTheLimit() {
        JsonNode root = object("""
                {"picks":[{"productId":12,"reason":"Art"},{"productId":999,"reason":"Invented"},
                          {"productId":4,"reason":"Scent"},{"productId":12,"reason":"Again"},
                          {"productId":"6","reason":"As text"},{"productId":1,"reason":"Over the limit"}]}
                """);
        assertThat(validator.picks(root, Set.of(1L, 4L, 6L, 12L), 3)).containsExactly(
                new ModelPick(12, "Art"), new ModelPick(4, "Scent"), new ModelPick(6, "As text"));
    }

    @Test
    void malformedPicksAreSkipped() {
        JsonNode root = object("""
                {"picks":[{"productId":4.5},{"productId":-4},{"productId":true},{"productId":"4 OR 1=1"},
                          "4",{"id":4},{"productId":4,"reason":{"text":"not a string"}}]}
                """);
        assertThat(validator.picks(root, Set.of(4L), 5)).containsExactly(new ModelPick(4, ""));
        assertThat(validator.picks(object("{\"picks\":{\"productId\":4}}"), Set.of(4L), 5)).isEmpty();
        assertThat(validator.picks(object("{}"), Set.of(4L), 5)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "Order at https://shop.example", "Visit www.shop.example", "<script>x</script>",
            "Click [here](x)", "<img src=x>" })
    void textWithALinkOrMarkupIsDropped(String text) {
        assertThat(validator.text(object("{\"t\":" + JsonMapper.builder().build().writeValueAsString(text) + "}")
                .path("t"), 200)).isEmpty();
    }

    @Test
    void textIsCleanedAndBounded() {
        JsonNode root = object("{\"t\":\"  Lovely\\n\\tgift  for a < b fan \",\"n\":5,\"long\":\"one two three four\"}");
        assertThat(validator.text(root.path("t"), 200)).isEqualTo("Lovely gift for a < b fan");
        assertThat(validator.text(root.path("n"), 200)).isEmpty();
        assertThat(validator.text(root.path("missing"), 200)).isEmpty();
        assertThat(validator.text(root.path("long"), 10)).isEqualTo("one two…");
    }

    @Test
    void textsFromAnArray() {
        JsonNode root = object("{\"m\":[\"One\",\"\",\"https://x.example\",\"Two\",\"Three\",\"Four\"],\"s\":\"One\"}");
        assertThat(validator.texts(root.path("m"), 3, 100)).containsExactly("One", "Two", "Three");
        assertThat(validator.texts(root.path("s"), 3, 100)).isEmpty();
    }
}
