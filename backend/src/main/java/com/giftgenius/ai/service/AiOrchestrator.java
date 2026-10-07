package com.giftgenius.ai.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import com.giftgenius.ai.dto.AiDtos.Pick;
import com.giftgenius.ai.dto.AiDtos.RecommendationRequest;
import com.giftgenius.ai.dto.AiDtos.RecommendationResponse;
import com.giftgenius.ai.provider.AiProvider;
import com.giftgenius.ai.service.AiOutputValidator.ModelPick;
import com.giftgenius.analytics.InteractionEvent;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.model.GiftPreferences;
import com.giftgenius.recommendation.model.Recommendation;
import com.giftgenius.recommendation.model.Shortlist;
import com.giftgenius.recommendation.service.RecommendationService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The AI layer for recommendations, one pipeline:
 * <pre>
 * request → preferences → GiftGenius recommendation engine → real, purchasable products
 *     → optional model refinement (re-rank and explain, within the shortlist only) → validated response
 * </pre>
 * The engine answers on its own. The model may only reorder and explain products the engine shortlisted: any other
 * id is discarded. When the model is unavailable, over budget, fails or answers badly, the engine's answer is
 * returned instead, so the shopper always gets real gifts.
 */
@Service
public class AiOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AiOrchestrator.class);
    private static final int SHORTLIST_SIZE = 12;
    private static final int DEFAULT_PICKS = 4;

    private final RecommendationService recommendations;
    private final PreferenceNormalizer normalizer;
    private final AiProvider ai;
    private final AiOutputValidator validator;
    private final ApplicationEventPublisher events;

    public AiOrchestrator(RecommendationService recommendations, PreferenceNormalizer normalizer, AiProvider ai,
            ObjectMapper json, ApplicationEventPublisher events) {
        this.recommendations = recommendations;
        this.normalizer = normalizer;
        this.ai = ai;
        this.validator = new AiOutputValidator(json);
        this.events = events;
    }

    /** The gift quiz: structured answers plus optional free-text notes. */
    public RecommendationResponse recommend(RecommendationRequest req) {
        GiftPreferences prefs = normalizer.normalize(req.recipient(), req.occasion(), req.budget(), req.interests(),
                req.personality());
        return recommend(prefs, req.notes(), req.limit() == null ? DEFAULT_PICKS : req.limit());
    }

    private RecommendationResponse recommend(GiftPreferences prefs, String notes, int limit) {
        RecommendationResponse res = answer(prefs, notes, limit);
        if (!res.picks().isEmpty()) {
            events.publishEvent(InteractionEvent.recommendationView(
                    res.picks().stream().map(p -> p.product().id()).toList(), res.source()));
        }
        return res;
    }

    private RecommendationResponse answer(GiftPreferences prefs, String notes, int limit) {
        // Exactly the picks to show, so each is explained alongside the others on screen.
        Shortlist found = recommendations.shortlist(prefs, limit);
        switch (found.outcome()) {
            case CATALOG_EMPTY -> {
                return new RecommendationResponse("rules", "We're restocking right now. Check back soon.", List.of(), null);
            }
            case NOTHING_IN_BUDGET -> {
                return new RecommendationResponse("rules",
                        "Nothing in the shop fits that budget yet. Try raising it a little.", List.of(), null);
            }
            default -> {
            }
        }
        RecommendationResponse rules = fromRules(found.items(), prefs, found.outcome());
        if (!ai.isAvailable()) {
            return rules;
        }
        try {
            // A wider choice for the model; still only real products the engine chose.
            List<Recommendation> shortlist = recommendations.shortlist(prefs, SHORTLIST_SIZE).items();
            String raw = ai.generateJson(AiPrompts.RECOMMEND_SYSTEM, AiPrompts.recommend(prefs, notes, shortlist, limit));
            Optional<RecommendationResponse> refined = refine(raw, shortlist, limit);
            if (refined.isEmpty()) {
                log.warn("AI recommendation unusable (no valid picks), using rule-based picks");
            }
            return refined.orElse(rules);
        } catch (RuntimeException e) {
            log.warn("AI recommendation failed, using rule-based picks: {}", e.getMessage());
            return rules;
        }
    }

    /** The model's ranking and words, validated against the shortlist; gaps are filled from the engine's ranking. */
    private Optional<RecommendationResponse> refine(String raw, List<Recommendation> shortlist, int limit) {
        Optional<JsonNode> answer = validator.object(raw);
        if (answer.isEmpty()) {
            return Optional.empty();
        }
        JsonNode root = answer.get();
        Map<Long, Recommendation> allowed = shortlist.stream().collect(Collectors.toMap(r -> r.product().id(),
                Function.identity(), (a, b) -> a, LinkedHashMap::new));
        List<ModelPick> chosen = validator.picks(root, allowed.keySet(), limit);
        if (chosen.isEmpty()) {
            return Optional.empty();
        }
        List<Pick> picks = new ArrayList<>();
        Set<Long> used = new LinkedHashSet<>();
        for (ModelPick m : chosen) {
            Recommendation r = allowed.get(m.productId());
            used.add(m.productId());
            picks.add(new Pick(r.product(), m.reason().isEmpty() ? r.summary() : m.reason(), r.score()));
        }
        for (Recommendation r : shortlist) {
            if (picks.size() >= limit) {
                break;
            }
            if (used.add(r.product().id())) {
                picks.add(new Pick(r.product(), r.summary(), r.score()));
            }
        }
        String summary = validator.text(root.path("summary"), 260);
        String message = validator.text(root.path("giftMessage"), 320);
        return Optional.of(new RecommendationResponse("ai", summary.isEmpty() ? null : summary, picks,
                message.isEmpty() ? null : message));
    }

    private static RecommendationResponse fromRules(List<Recommendation> shown, GiftPreferences c,
            Shortlist.Outcome outcome) {
        List<Pick> picks = shown.stream().map(s -> new Pick(s.product(), s.summary(), s.score())).toList();
        String summary;
        if (outcome == Shortlist.Outcome.TOP_RATED) {
            summary = c.isEmpty() ? "Our highest-rated gifts right now."
                    : "Nothing matched everything you asked for, so here are our highest-rated gifts.";
        } else {
            String who = c.recipient() == null ? "your loved one" : "your " + c.recipient();
            summary = picks.size() + " gifts matched for " + who
                    + (c.occasion() == null ? "" : " for their " + c.occasion()) + ".";
        }
        return new RecommendationResponse("rules", summary, picks, FallbackCopy.giftMessage(c.occasion()));
    }
}
