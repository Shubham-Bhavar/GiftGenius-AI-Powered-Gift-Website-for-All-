package com.giftgenius.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Hands published {@link InteractionEvent}s to the {@link InteractionRecorder}: after the publishing transaction
 * commits, or straight away when there is none. Analytics can never fail or undo what the shopper did.
 */
@Component
public class InteractionListener {

    private static final Logger log = LoggerFactory.getLogger(InteractionListener.class);

    private final InteractionRecorder recorder;

    public InteractionListener(InteractionRecorder recorder) {
        this.recorder = recorder;
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void on(InteractionEvent event) {
        try {
            recorder.record(event);
        } catch (RuntimeException e) {
            log.warn("Couldn't record a {} event: {}", event.type().wireName(), e.getMessage());
        }
    }
}
