package com.giftgenius.newsletter;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NewsletterService {

    private final NewsletterRepository subscribers;

    public NewsletterService(NewsletterRepository subscribers) {
        this.subscribers = subscribers;
    }

    /** Idempotent: subscribing twice is not an error, and doesn't reveal whether the email existed. */
    @Transactional
    public void subscribe(String email) {
        String normalized = email.trim().toLowerCase();
        if (!subscribers.existsByEmailIgnoreCase(normalized)) {
            NewsletterSubscriber s = new NewsletterSubscriber();
            s.setEmail(normalized);
            subscribers.save(s);
        }
    }
}
