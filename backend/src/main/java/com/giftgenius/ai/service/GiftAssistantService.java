package com.giftgenius.ai.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.giftgenius.ai.dto.AiDtos.AssistantReply;
import com.giftgenius.ai.dto.AiDtos.AssistantRequest;
import com.giftgenius.ai.dto.AiDtos.Pick;
import com.giftgenius.ai.dto.AiDtos.RecommendationResponse;
import com.giftgenius.ai.dto.AiDtos.Understood;
import com.giftgenius.ai.provider.AiProvider;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.TextPreferenceParser;
import com.giftgenius.recommendation.model.GiftPreferences;

import tools.jackson.databind.ObjectMapper;

/**
 * The gift shopping assistant: a short conversation in the shopper's own words, answered with real catalogue products.
 *
 * <p>Each turn reads everything the shopper has said so far (newest first, so a correction wins: "actually, under
 * ₹1,000"), with the same reading as a gift request: the model when it is configured, otherwise rules. With nothing
 * to go on it only asks who the gift is for; otherwise it answers with picks from the recommendation engine (real,
 * in-stock products, validated whoever ranked them, never above the budget they gave) and, while the recipient,
 * occasion or budget is still unknown, asks for the most useful of them.
 *
 * <p>It never invents a product, price, stock level or discount (everything shown comes from the catalogue), and it
 * can't add to the cart or place an order: it links to product pages, where the shopper decides.
 */
@Service
public class GiftAssistantService {

    static final int PICKS = 4;
    /** What the shopper said, newest first, is read up to this many characters. */
    static final int MAX_TEXT = 1_500;

    static final String ASK_EVERYTHING = "Happy to help! Who is the gift for, and what's the occasion? A budget helps too.";
    static final String ASK_RECIPIENT = "Who is it for? For example your mom, a friend or a colleague.";
    static final String ASK_OCCASION = "What's the occasion? A birthday, an anniversary, a festival, or just because?";
    static final String ASK_BUDGET = "Is there a budget I should stay within?";
    static final String NEUTRAL_REPLY = "Here are a few gifts from the shop that fit what you told me.";
    static final String NEUTRAL_REASON = "A good match for what you told me.";

    /**
     * Claims only the catalogue may make: prices, discounts, offers, stock levels and delivery terms. Text the model
     * wrote that makes one is replaced: the real price and stock are shown from the catalogue beside it.
     */
    static final java.util.regex.Pattern CATALOGUE_CLAIM = java.util.regex.Pattern.compile(
            "(?iu)₹|\\brs\\.?\\s*\\d|\\brupees?\\b|\\binr\\b|\\$\\s*\\d|\\d\\s*%|\\bper ?cent\\b|\\bdiscount|\\bcoupon|\\bpromo"
                    + "|\\bsale\\b|\\boffer|\\bdeal\\b|\\bcheap|\\bfree (?:delivery|shipping)|\\bin stock\\b|\\bout of stock"
                    + "|\\bonly \\d+ left|\\blast (?:one|few)\\b|\\bdelivered (?:today|tomorrow)|\\bprice");

    private final PreferenceExtractor extractor;
    private final AiOrchestrator orchestrator;

    public GiftAssistantService(AiProvider ai, ObjectMapper json, TextPreferenceParser parser,
            PreferenceNormalizer normalizer, AiOrchestrator orchestrator) {
        this.extractor = new PreferenceExtractor(ai, new AiOutputValidator(json), parser, normalizer);
        this.orchestrator = orchestrator;
    }

    public AssistantReply reply(AssistantRequest req) {
        String said = conversation(req.messages());
        PreferenceExtractor.Extraction read = extractor.extract(said);
        GiftPreferences p = read.preferences();
        Understood understood = new Understood(p.recipient(), p.occasion(), p.hasBudget() ? p.budget() : null,
                p.interests(), p.personality(), List.copyOf(p.avoid()), read.by());
        if (p.isEmpty()) {
            return new AssistantReply("rules", ASK_EVERYTHING, ASK_EVERYTHING, understood, List.of());
        }

        RecommendationResponse res = orchestrator.recommend(p, said, PICKS);
        List<Pick> picks = res.picks().stream()
                .filter(pick -> pick.product() != null && pick.product().inStock())
                .filter(pick -> !p.hasBudget()
                        || pick.product().price().compareTo(java.math.BigDecimal.valueOf(p.budget())) <= 0)
                .toList();
        if ("ai".equals(res.source())) {
            picks = picks.stream().map(pick -> claims(pick.reason())
                    ? new Pick(pick.product(), NEUTRAL_REASON, pick.score(), pick.match(), pick.checks()) : pick).toList();
        }
        String summary = "ai".equals(res.source()) && claims(res.summary()) ? NEUTRAL_REPLY : res.summary();
        String question = question(p);
        String reply = picks.isEmpty()
                ? (p.hasBudget() ? "I couldn't find anything in stock within ₹" + p.budget()
                        + " for that. Would a slightly higher budget work?"
                        : "I couldn't find a good match in the shop for that yet. Could you tell me a bit more?")
                : summary;
        return new AssistantReply(res.source(), reply, picks.isEmpty() ? null : question, understood, picks);
    }

    /** Whether text the model wrote claims a price, discount, offer, stock level or delivery term. */
    static boolean claims(String text) {
        return text != null && CATALOGUE_CLAIM.matcher(text).find();
    }

    /** Everything the shopper said, newest first, as one text of at most {@link #MAX_TEXT} characters. */
    static String conversation(List<String> messages) {
        List<String> newestFirst = new ArrayList<>(messages);
        java.util.Collections.reverse(newestFirst);
        StringBuilder out = new StringBuilder();
        for (String m : newestFirst) {
            String turn = m == null ? "" : m.strip();
            if (turn.isEmpty()) {
                continue;
            }
            if (out.length() + turn.length() + 2 > MAX_TEXT) {
                break;
            }
            if (!out.isEmpty()) {
                out.append(". ");
            }
            out.append(turn);
        }
        return out.toString();
    }

    /** The most useful thing still unknown: who it's for, then the occasion, then the budget; null when all known. */
    static String question(GiftPreferences p) {
        if (p.recipient() == null) {
            return ASK_RECIPIENT;
        }
        if (p.occasion() == null) {
            return ASK_OCCASION;
        }
        if (!p.hasBudget()) {
            return ASK_BUDGET;
        }
        return null;
    }
}
