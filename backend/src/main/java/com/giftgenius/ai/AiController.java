package com.giftgenius.ai;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.ai.AiDtos.GiftMessageRequest;
import com.giftgenius.ai.AiDtos.GiftMessageResponse;
import com.giftgenius.ai.AiDtos.RecommendationRequest;
import com.giftgenius.ai.AiDtos.RecommendationResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final GiftAdvisorService advisor;

    public AiController(GiftAdvisorService advisor) {
        this.advisor = advisor;
    }

    @PostMapping("/recommendations")
    public RecommendationResponse recommend(@Valid @RequestBody RecommendationRequest req) {
        return advisor.recommend(req);
    }

    @PostMapping("/gift-message")
    public GiftMessageResponse giftMessage(@Valid @RequestBody GiftMessageRequest req) {
        return advisor.giftMessages(req);
    }
}
