package com.giftgenius.ai.service;

import org.springframework.stereotype.Service;

import com.giftgenius.ai.dto.AiDtos.GiftRequest;
import com.giftgenius.ai.dto.AiDtos.GiftRequestResponse;
import com.giftgenius.ai.dto.AiDtos.RecommendationResponse;
import com.giftgenius.ai.dto.AiDtos.Understood;
import com.giftgenius.ai.provider.AiProvider;
import com.giftgenius.ai.service.PreferenceExtractor.Extraction;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;
import com.giftgenius.recommendation.engine.TextPreferenceParser;
import com.giftgenius.recommendation.model.GiftPreferences;

import tools.jackson.databind.ObjectMapper;

/**
 * Gift requests in the shopper's own words, e.g. "a birthday gift for my mom under ₹1,500, she loves perfume":
 * preferences are read from the sentence (by the model when available, otherwise by rules), then answered exactly
 * like the quiz by the {@link AiOrchestrator}: real products from the engine, optionally refined, always validated.
 */
@Service
public class GiftRequestService {

    private static final int DEFAULT_PICKS = 4;

    private final PreferenceExtractor extractor;
    private final AiOrchestrator orchestrator;

    public GiftRequestService(AiProvider ai, ObjectMapper json, TextPreferenceParser parser,
            PreferenceNormalizer normalizer, AiOrchestrator orchestrator) {
        this.extractor = new PreferenceExtractor(ai, new AiOutputValidator(json), parser, normalizer);
        this.orchestrator = orchestrator;
    }

    public GiftRequestResponse answer(GiftRequest req) {
        Extraction read = extractor.extract(req.text());
        GiftPreferences p = read.preferences();
        RecommendationResponse res = orchestrator.recommend(p, req.text(),
                req.limit() == null ? DEFAULT_PICKS : req.limit());
        Understood understood = new Understood(p.recipient(), p.occasion(), p.hasBudget() ? p.budget() : null,
                p.interests(), p.personality(), read.by());
        return new GiftRequestResponse(res.source(), understood, res.summary(), res.picks(), res.giftMessage());
    }
}
