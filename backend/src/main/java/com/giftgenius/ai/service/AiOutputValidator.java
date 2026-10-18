package com.giftgenius.ai.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Checks everything the model returns before any of it is used. The answer must be a JSON object; picks must be an
 * array of objects whose product id is on the allow-list (the engine's shortlist), each id once; text for the shopper
 * is cleaned, bounded, and dropped when it carries a link or markup. Anything else in the answer is ignored.
 */
final class AiOutputValidator {

    /** A pick the model made, on the allow-list. The reason may be "" (then the engine's explanation is used). */
    record ModelPick(long productId, String reason) {
    }

    private final ObjectMapper json;

    AiOutputValidator(ObjectMapper json) {
        this.json = json;
    }

    /** The answer as a JSON object (a ```json fence is tolerated), or empty when it isn't one. */
    Optional<JsonNode> object(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String s = raw.trim();
        if (s.startsWith("```")) {
            s = s.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        }
        try {
            JsonNode node = json.readTree(s);
            return node != null && node.isObject() ? Optional.of(node) : Optional.empty();
        } catch (JacksonException e) {
            return Optional.empty();
        }
    }

    /** The model's picks that are on the allow-list, each once, in its order, at most {@code limit}. */
    List<ModelPick> picks(JsonNode root, Set<Long> allowed, int limit) {
        JsonNode picks = root.path("picks");
        if (!picks.isArray()) {
            return List.of();
        }
        List<ModelPick> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (JsonNode p : picks) {
            OptionalLong id = productId(p.path("productId"));
            if (id.isEmpty() || !allowed.contains(id.getAsLong()) || !seen.add(id.getAsLong())) {
                continue; // malformed, invented or repeated
            }
            out.add(new ModelPick(id.getAsLong(), text(p.path("reason"), 220)));
            if (out.size() == limit) {
                break;
            }
        }
        return out;
    }

    /** A piece of text for the shopper, or "" when missing, not a string, or unsafe. */
    String text(JsonNode node, int max) {
        return node.isString() ? AiText.forShopper(node.asString(), max) : "";
    }

    /** Up to {@code count} non-empty texts from an array, or none when it isn't one. */
    List<String> texts(JsonNode array, int count, int max) {
        if (!array.isArray()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (JsonNode node : array) {
            String t = text(node, max);
            if (!t.isEmpty()) {
                out.add(t);
            }
            if (out.size() == count) {
                break;
            }
        }
        return out;
    }

    private static OptionalLong productId(JsonNode n) {
        if (n.isIntegralNumber() && n.canConvertToLong()) {
            return OptionalLong.of(n.asLong());
        }
        if (n.isString() && n.asString().matches("\\d{1,18}")) {
            return OptionalLong.of(Long.parseLong(n.asString()));
        }
        return OptionalLong.empty();
    }
}
