package com.giftgenius.contact;

import java.time.Instant;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.giftgenius.common.ApiException;
import com.giftgenius.common.PageResponse;
import com.giftgenius.config.AppProperties;
import com.giftgenius.contact.ContactDtos.ContactMessageDto;
import com.giftgenius.contact.ContactDtos.ContactRequest;
import com.giftgenius.notify.Mailer;

/**
 * Contact messages: stored for the admin inbox, and the store is notified by email at ADMIN_EMAIL. Nothing is
 * ever emailed to the address a visitor types in, so the form can't be used to send mail to strangers.
 */
@Service
public class ContactService {

    private final ContactMessageRepository messages;
    private final Mailer mailer;
    private final String adminEmail;

    public ContactService(ContactMessageRepository messages, Mailer mailer, AppProperties properties) {
        this.messages = messages;
        this.mailer = mailer;
        this.adminEmail = properties.admin() == null ? null : properties.admin().email();
    }

    @Transactional
    public void submit(ContactRequest req) {
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
    }

    /** The admin inbox, newest first; {@code handled} narrows to open or handled messages. */
    @Transactional(readOnly = true)
    public PageResponse<ContactMessageDto> list(Boolean handled, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        var result = handled == null ? messages.findAllByOrderByCreatedAtDesc(pr)
                : messages.findByHandledOrderByCreatedAtDesc(handled, pr);
        return PageResponse.of(result.map(ContactMessageDto::from));
    }

    @Transactional
    public ContactMessageDto markHandled(Long id, boolean handled) {
        ContactMessage m = messages.findById(id).orElseThrow(() -> ApiException.notFound("Message not found."));
        m.setHandled(handled);
        m.setHandledAt(handled ? Instant.now() : null);
        return ContactMessageDto.from(m);
    }
}
