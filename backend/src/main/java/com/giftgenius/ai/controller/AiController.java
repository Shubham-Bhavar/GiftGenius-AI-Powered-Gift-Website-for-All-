package com.giftgenius.ai.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.ai.dto.AiDtos.GiftMessageRequest;
import com.giftgenius.ai.dto.AiDtos.GiftMessageResponse;
import com.giftgenius.ai.dto.AiDtos.GiftRequest;
import com.giftgenius.ai.dto.AiDtos.GiftRequestResponse;
import com.giftgenius.ai.dto.AiDtos.RecommendationRequest;
import com.giftgenius.ai.dto.AiDtos.RecommendationResponse;
import com.giftgenius.ai.service.AiOrchestrator;
import com.giftgenius.ai.service.GiftMessageService;
import com.giftgenius.ai.service.GiftRequestService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiOrchestrator orchestrator;
    private final GiftMessageService messages;
    private final GiftRequestService requests;

    public AiController(AiOrchestrator orchestrator, GiftMessageService messages, GiftRequestService requests) {
        this.orchestrator = orchestrator;
        this.messages = messages;
        this.requests = requests;
    }

    @PostMapping("/recommendations")
    public RecommendationResponse recommend(@Valid @RequestBody RecommendationRequest req) {
        return orchestrator.recommend(req);
    }

    @PostMapping("/gift-message")
    public GiftMessageResponse giftMessage(@Valid @RequestBody GiftMessageRequest req) {
        return messages.giftMessages(req);
    }

    /** A gift request in the shopper's own words: understood, then answered with real products. */
    @PostMapping("/gift-request")
    public GiftRequestResponse giftRequest(@Valid @RequestBody GiftRequest req) {
        return requests.answer(req);
    }
}
