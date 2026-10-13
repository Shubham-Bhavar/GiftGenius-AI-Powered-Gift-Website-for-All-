package com.giftgenius.ai.provider;

/** No model configured (no GEMINI_API_KEY, or AI_ENABLED=false): every AI feature answers from its rules. */
final class DisabledAiProvider implements AiProvider {

    @Override
    public boolean isAvailable() {
        return false;
    }

    @Override
    public String generateJson(String systemPrompt, String userPrompt) {
        throw new AiException("No AI model is configured");
    }
}
