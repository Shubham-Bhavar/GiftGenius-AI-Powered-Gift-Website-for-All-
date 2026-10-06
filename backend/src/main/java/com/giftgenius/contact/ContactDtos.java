package com.giftgenius.contact;

import java.time.Instant;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class ContactDtos {

    private ContactDtos() {
    }

    public record ContactRequest(
            @NotBlank(message = "Enter your name") @Size(max = 120) String name,
            @NotBlank(message = "Enter your email") @Email(message = "Enter a valid email") @Size(max = 255) String email,
            @NotBlank @Pattern(regexp = "general|order|bulk|partnership", message = "Choose a topic") String topic,
            @Size(max = 20) @Pattern(regexp = "^$|^[A-Za-z0-9-]{4,20}$", message = "Enter a valid order ID") String orderNumber,
            @NotBlank(message = "Write a message")
            @Size(min = 10, max = 2000, message = "Use 10 to 2000 characters") String message) {
    }

    public record ContactMessageDto(Long id, String name, String email, String topic, String orderNumber, String message,
            boolean handled, Instant handledAt, Instant createdAt) {

        static ContactMessageDto from(ContactMessage m) {
            return new ContactMessageDto(m.getId(), m.getName(), m.getEmail(), m.getTopic(), m.getOrderNumber(),
                    m.getMessage(), m.isHandled(), m.getHandledAt(), m.getCreatedAt());
        }
    }

    public record HandledRequest(@NotNull Boolean handled) {
    }
}
