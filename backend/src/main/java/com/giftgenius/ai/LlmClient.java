package com.giftgenius.ai;

/** Minimal seam over the language model so the provider can be swapped or mocked in tests. */
public interface LlmClient {

    boolean isAvailable();

    /**
     * Sends one system + user prompt and returns the model's JSON text.
     *
     * @throws LlmException on transport errors, timeouts, safety blocks or empty output
     */
    String generateJson(String systemPrompt, String userPrompt);

    class LlmException extends RuntimeException {
        public LlmException(String message) {
            super(message);
        }

        public LlmException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
