package com.giftgenius.ai.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.ai.dto.AiDtos.AssistantReply;
import com.giftgenius.ai.dto.AiDtos.AssistantRequest;
import com.giftgenius.ai.dto.AiDtos.GiftMessageRequest;
import com.giftgenius.ai.dto.AiDtos.GiftMessageResponse;
import com.giftgenius.ai.dto.AiDtos.GiftRequest;
import com.giftgenius.ai.dto.AiDtos.GiftRequestResponse;
import com.giftgenius.ai.dto.AiDtos.RecommendationRequest;
import com.giftgenius.ai.dto.AiDtos.RecommendationResponse;
import com.giftgenius.ai.service.AiOrchestrator;
import com.giftgenius.ai.service.GiftAssistantService;
import com.giftgenius.ai.service.GiftMessageService;
import com.giftgenius.ai.service.GiftRequestService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiOrchestrator orchestrator;
    private final GiftMessageService messages;
    private final GiftRequestService requests;
    private final GiftAssistantService assistant;

    public AiController(AiOrchestrator orchestrator, GiftMessageService messages, GiftRequestService requests,
            GiftAssistantService assistant) {
        this.orchestrator = orchestrator;
        this.messages = messages;
        this.requests = requests;
        this.assistant = assistant;
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

    /**
     * The gift shopping assistant: one turn of a short conversation, answered with real products and, when useful, a
     * follow-up question. Read-only: it never changes a cart or places an order.
     */
    @PostMapping("/assistant")
    public AssistantReply assistant(@Valid @RequestBody AssistantRequest req) {
        return assistant.reply(req);
    }
}
