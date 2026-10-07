package com.giftgenius.analytics;

import org.springframework.stereotype.Component;

/** Records nothing: no tracking tables, no third parties. A real {@link InteractionRecorder} replaces this bean. */
@Component
public class NoOpInteractionRecorder implements InteractionRecorder {

    @Override
    public void record(InteractionEvent event) {
        // Intentionally empty.
    }
}
