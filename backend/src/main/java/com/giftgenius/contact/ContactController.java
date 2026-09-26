package com.giftgenius.contact;

import java.time.Instant;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.config.AppProperties;
import com.giftgenius.notify.Mailer;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Contact form (public, rate-limited) and the admin inbox. The store is notified by email at
 * ADMIN_EMAIL; nothing is ever emailed to the address a visitor types in, so the form can't be
 * used to send mail to strangers.
 */
@RestController
public class ContactController {

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

    private final ContactMessageRepository messages;
    private final Mailer mailer;
    private final String adminEmail;

    public ContactController(ContactMessageRepository messages, Mailer mailer, AppProperties properties) {
        this.messages = messages;
        this.mailer = mailer;
        this.adminEmail = properties.admin() == null ? null : properties.admin().email();
    }

    @PostMapping("/api/contact")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public Map<String, String> submit(@Valid @RequestBody ContactRequest req) {
        ContactMessage m = new ContactMessage();
        m.setName(req.name().trim());
        m.setEmail(req.email().trim().toLowerCase());
        m.setTopic(req.topic());
        m.setOrderNumber(StringUtils.hasText(req.orderNumber()) ? req.orderNumber().trim().toUpperCase() : null);
        m.setMessage(req.message().trim());
        messages.save(m);
        if (StringUtils.hasText(adminEmail)) {
            mailer.send(adminEmail, "New " + m.getTopic() + " message from " + m.getName(), """
                    %s <%s> wrote (%s%s):

                    %s

                    Reply to the customer at %s, then mark it handled in Store admin → Messages.
                    """.formatted(m.getName(), m.getEmail(), m.getTopic(),
                    m.getOrderNumber() == null ? "" : ", order " + m.getOrderNumber(), m.getMessage(), m.getEmail()));
        }
        return Map.of("status", "received");
    }

    @GetMapping("/api/admin/messages")
    @Transactional(readOnly = true)
    public PageResponse<ContactMessageDto> list(@RequestParam(required = false) Boolean handled,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        var result = handled == null ? messages.findAllByOrderByCreatedAtDesc(pr)
                : messages.findByHandledOrderByCreatedAtDesc(handled, pr);
        return PageResponse.of(result.map(ContactMessageDto::from));
    }

    @PatchMapping("/api/admin/messages/{id}")
    @Transactional
    public ContactMessageDto markHandled(@PathVariable Long id, @Valid @RequestBody HandledRequest req) {
        ContactMessage m = messages.findById(id).orElseThrow(() -> ApiException.notFound("Message not found."));
        m.setHandled(req.handled());
        m.setHandledAt(req.handled() ? Instant.now() : null);
        return ContactMessageDto.from(m);
    }
}
