package com.giftgenius.ai.provider;

/**
 * The language model behind the AI features, as one narrow seam: a system and a user prompt in, JSON text out.
 * It has no tools: it can't query the database, touch files, run commands or take payments. Whatever it returns is
 * validated before use, and every caller has a rules-based answer for when it is unavailable or wrong.
 */
public interface AiProvider {

    /** Whether a model can be asked right now: configured, and within its call budget. */
    boolean isAvailable();

    /**
     * Sends one system + user prompt and returns the model's JSON text.
     *
     * @throws AiException when unavailable or over budget, and on transport errors, timeouts, safety blocks or
     *                     empty output
     */
    String generateJson(String systemPrompt, String userPrompt);

    /** The model couldn't answer; callers answer from their rules instead. */
    class AiException extends RuntimeException {

        public AiException(String message) {
            super(message);
        }

        public AiException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
