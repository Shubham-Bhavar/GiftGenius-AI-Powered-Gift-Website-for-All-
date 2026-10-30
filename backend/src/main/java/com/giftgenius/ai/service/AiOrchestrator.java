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
import com.giftgenius.ai.dto.AiDtos.Plan;
import com.giftgenius.ai.dto.AiDtos.PlanOption;
import com.giftgenius.ai.dto.AiDtos.RecommendationRequest;
import com.giftgenius.ai.dto.AiDtos.RecommendationResponse;
import com.giftgenius.ai.provider.AiProvider;
import com.giftgenius.ai.service.AiOutputValidator.ModelPick;
import com.giftgenius.analytics.InteractionEvent;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.TextPreferenceParser;
import com.giftgenius.recommendation.model.GiftPlan;
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
 * returned instead, so the shopper always gets real gifts. Each pick's match and checks, the avoid list and the budget
 * plan always come from the engine.
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
    private final TextPreferenceParser parser = new TextPreferenceParser();
    private final ApplicationEventPublisher events;

    public AiOrchestrator(RecommendationService recommendations, PreferenceNormalizer normalizer, AiProvider ai,
            ObjectMapper json, ApplicationEventPublisher events) {
        this.recommendations = recommendations;
        this.normalizer = normalizer;
        this.ai = ai;
        this.validator = new AiOutputValidator(json);
        this.events = events;
    }

    /**
     * The gift quiz: structured answers plus optional free-text notes. What to avoid comes from the quiz's own question
     * and from the notes ("she hates jewellery"), so the notes count even when no model reads them.
     */
    public RecommendationResponse recommend(RecommendationRequest req) {
        List<String> avoid = new ArrayList<>(req.avoid() == null ? List.of() : req.avoid());
        avoid.addAll(parser.parse(req.notes()).avoid());
        GiftPreferences prefs = normalizer.normalize(req.recipient(), req.occasion(), req.budget(), req.interests(),
                req.personality(), avoid);
        return recommend(prefs, req.notes(), req.limit() == null ? DEFAULT_PICKS : req.limit());
    }

    /** Preferences already read (from the quiz, or from a sentence), with the shopper's free text as notes. */
    RecommendationResponse recommend(GiftPreferences prefs, String notes, int limit) {
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
        List<String> avoided = List.copyOf(prefs.avoid());
        switch (found.outcome()) {
            case CATALOG_EMPTY -> {
                return new RecommendationResponse("rules", "We're restocking right now. Check back soon.", List.of(),
                        null, avoided, null);
            }
            case NOTHING_IN_BUDGET -> {
                return new RecommendationResponse("rules",
                        "Nothing in the shop fits that budget yet. Try raising it a little.", List.of(), null, avoided,
                        null);
            }
            case EVERYTHING_AVOIDED -> {
                return new RecommendationResponse("rules",
                        "Everything within that budget is on their don't-like list. Try taking something off it.",
                        List.of(), null, avoided, null);
            }
            default -> {
            }
        }
        Plan plan = recommendations.plan(prefs).map(AiOrchestrator::plan).orElse(null);
        RecommendationResponse rules = fromRules(found.items(), prefs, found.outcome(), plan);
        if (!ai.isAvailable()) {
            return rules;
        }
        try {
            // A wider choice for the model; still only real products the engine chose.
            List<Recommendation> shortlist = recommendations.shortlist(prefs, SHORTLIST_SIZE).items();
            String raw = ai.generateJson(AiPrompts.RECOMMEND_SYSTEM, AiPrompts.recommend(prefs, notes, shortlist, limit));
            Optional<RecommendationResponse> refined = refine(raw, shortlist, limit, avoided, plan);
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
    private Optional<RecommendationResponse> refine(String raw, List<Recommendation> shortlist, int limit,
            List<String> avoided, Plan plan) {
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
            picks.add(pick(r, m.reason().isEmpty() ? r.summary() : m.reason()));
        }
        for (Recommendation r : shortlist) {
            if (picks.size() >= limit) {
                break;
            }
            if (used.add(r.product().id())) {
                picks.add(pick(r, r.summary()));
            }
        }
        String summary = validator.text(root.path("summary"), 260);
        String message = validator.text(root.path("giftMessage"), 320);
        return Optional.of(new RecommendationResponse("ai", summary.isEmpty() ? null : summary, picks,
                message.isEmpty() ? null : message, avoided, plan));
    }

    private static RecommendationResponse fromRules(List<Recommendation> shown, GiftPreferences c,
            Shortlist.Outcome outcome, Plan plan) {
        List<Pick> picks = shown.stream().map(s -> pick(s, s.summary())).toList();
        String summary;
        if (outcome == Shortlist.Outcome.TOP_RATED) {
            summary = c.isEmpty() ? "Our highest-rated gifts right now."
                    : "Nothing matched everything you asked for, so here are our highest-rated gifts.";
        } else {
            String who = c.recipient() == null ? "your loved one" : "your " + c.recipient();
            summary = picks.size() + " gifts matched for " + who
                    + (c.occasion() == null ? "" : " for their " + c.occasion()) + ".";
        }
        return new RecommendationResponse("rules", summary, picks, FallbackCopy.giftMessage(c.occasion()),
                List.copyOf(c.avoid()), plan);
    }

    private static Pick pick(Recommendation r, String reason) {
        return new Pick(r.product(), reason, r.score(), r.match(), r.checks());
    }

    private static Plan plan(GiftPlan plan) {
        return new Plan(plan.budget(), plan.options().stream()
                .map(o -> new PlanOption(o.kind(), o.pick().product(), o.pick().summary(), o.pick().match(),
                        o.pick().checks()))
                .toList(), plan.missing());
    }
}
