package com.giftgenius.newsletter;

import java.util.Map;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/newsletter")
public class NewsletterController {

    public record SubscribeRequest(@NotBlank @Email(message = "Enter a valid email") @Size(max = 255) String email) {
    }

    private final NewsletterRepository subscribers;

    public NewsletterController(NewsletterRepository subscribers) {
        this.subscribers = subscribers;
    }

    /** Idempotent: subscribing twice is not an error, and doesn't reveal whether the email existed. */
    @PostMapping("/subscribe")
    @Transactional
    public Map<String, String> subscribe(@Valid @RequestBody SubscribeRequest req) {
        String email = req.email().trim().toLowerCase();
        if (!subscribers.existsByEmailIgnoreCase(email)) {
            NewsletterSubscriber s = new NewsletterSubscriber();
            s.setEmail(email);
            subscribers.save(s);
        }
        return Map.of("status", "subscribed");
    }
}
