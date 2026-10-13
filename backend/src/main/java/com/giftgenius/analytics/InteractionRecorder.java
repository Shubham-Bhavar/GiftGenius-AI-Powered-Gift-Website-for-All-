package com.giftgenius.analytics;

/**
 * Where interaction events go: the extension point for analytics and, later, personalisation (see
 * {@code recommendation.engine.PersonalizationProvider}). Events arrive only after the work they describe has
 * committed (a rolled-back order is never a purchase). An implementation should be quick or hand off to its own
 * thread, and must not store more than the event holds. Today's implementation is {@link NoOpInteractionRecorder}.
 */
public interface InteractionRecorder {

    void record(InteractionEvent event);
}
