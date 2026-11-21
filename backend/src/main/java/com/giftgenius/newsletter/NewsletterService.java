package com.giftgenius.newsletter;

import org.springframework.stereotype.Service;

@Service
public class NewsletterService {

    private final NewsletterRepository subscribers;

    public NewsletterService(NewsletterRepository subscribers) {
        this.subscribers = subscribers;
    }

    /**
     * Idempotent: subscribing twice is not an error, and doesn't reveal whether the email existed, even when the two
     * requests arrive at the same moment (the second insert meets the unique key and is taken as "already there").
     */
    public void subscribe(String email) {
        String normalized = email.trim().toLowerCase();
        if (!subscribers.existsByEmailIgnoreCase(normalized)) {
            NewsletterSubscriber s = new NewsletterSubscriber();
            s.setEmail(normalized);
            try {
                subscribers.saveAndFlush(s);
            } catch (org.springframework.dao.DataIntegrityViolationException alreadySubscribed) {
                // Subscribed by a request that ran at the same time: the outcome the shopper asked for.
            }
        }
    }
}
