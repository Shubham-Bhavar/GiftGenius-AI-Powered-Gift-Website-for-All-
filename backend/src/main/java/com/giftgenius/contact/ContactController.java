package com.giftgenius.contact;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.common.PageResponse;
import com.giftgenius.contact.ContactDtos.ContactMessageDto;
import com.giftgenius.contact.ContactDtos.ContactRequest;
import com.giftgenius.contact.ContactDtos.HandledRequest;

import jakarta.validation.Valid;

/** The contact form (public, rate-limited) and the admin inbox. */
@RestController
public class ContactController {

    private final ContactService contact;

    public ContactController(ContactService contact) {
        this.contact = contact;
    }

    @PostMapping("/api/contact")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> submit(@Valid @RequestBody ContactRequest req) {
        contact.submit(req);
        return Map.of("status", "received");
    }

    @GetMapping("/api/admin/messages")
    public PageResponse<ContactMessageDto> list(@RequestParam(required = false) Boolean handled,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return contact.list(handled, page, size);
    }

    @PatchMapping("/api/admin/messages/{id}")
    public ContactMessageDto markHandled(@PathVariable Long id, @Valid @RequestBody HandledRequest req) {
        return contact.markHandled(id, req.handled());
    }
}
