package com.giftgenius.newsletter;

import java.util.Map;

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

    private final NewsletterService newsletter;

    public NewsletterController(NewsletterService newsletter) {
        this.newsletter = newsletter;
    }

    @PostMapping("/subscribe")
    public Map<String, String> subscribe(@Valid @RequestBody SubscribeRequest req) {
        newsletter.subscribe(req.email());
        return Map.of("status", "subscribed");
    }
}
