package com.giftgenius.ai.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.giftgenius.ai.dto.AiDtos.GiftMessageRequest;
import com.giftgenius.ai.dto.AiDtos.GiftMessageResponse;
import com.giftgenius.ai.provider.AiProvider;
import com.giftgenius.recommendation.engine.PreferenceNormalizer;

import tools.jackson.databind.ObjectMapper;

/** Gift card messages: three from the model when it's available and answers well, otherwise warm templates. */
@Service
public class GiftMessageService {

    private static final Logger log = LoggerFactory.getLogger(GiftMessageService.class);
    private static final int MESSAGES = 3;

    private final AiProvider ai;
    private final PreferenceNormalizer normalizer;
    private final AiOutputValidator validator;

    public GiftMessageService(AiProvider ai, PreferenceNormalizer normalizer, ObjectMapper json) {
        this.ai = ai;
        this.normalizer = normalizer;
        this.validator = new AiOutputValidator(json);
    }

    public GiftMessageResponse giftMessages(GiftMessageRequest req) {
        if (ai.isAvailable()) {
            try {
                List<String> messages = validator.object(ai.generateJson(AiPrompts.MESSAGE_SYSTEM, AiPrompts.message(req)))
                        .map(root -> validator.texts(root.path("messages"), MESSAGES, 320))
                        .orElse(List.of());
                if (!messages.isEmpty()) {
                    return new GiftMessageResponse("ai", messages);
                }
                log.warn("AI gift messages unusable, using templates");
            } catch (RuntimeException e) {
                log.warn("AI gift message failed, using templates: {}", e.getMessage());
            }
        }
        String occasion = normalizer.normalize(null, req.occasion(), null, null, null).occasion();
        return new GiftMessageResponse("rules", FallbackCopy.giftMessages(occasion, req.senderName()));
    }
}
