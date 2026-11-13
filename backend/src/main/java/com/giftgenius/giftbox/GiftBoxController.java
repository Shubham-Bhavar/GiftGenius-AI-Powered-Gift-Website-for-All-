package com.giftgenius.giftbox;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.giftbox.GiftBoxDtos.CheckRequest;
import com.giftgenius.giftbox.GiftBoxDtos.CheckResponse;
import com.giftgenius.giftbox.GiftBoxDtos.SuggestionRequest;
import com.giftgenius.giftbox.GiftBoxDtos.SuggestionResponse;

import jakarta.validation.Valid;

/** The Gift Studio's box composer: public, read-only, and answered by the engine alone (no model, no cost). */
@RestController
@RequestMapping("/api/gift-box")
public class GiftBoxController {

    private final GiftBoxService boxes;

    public GiftBoxController(GiftBoxService boxes) {
        this.boxes = boxes;
    }

    /** A few boxes of different gifts that together fit the budget. */
    @PostMapping("/suggestions")
    public SuggestionResponse suggest(@Valid @RequestBody SuggestionRequest req) {
        return boxes.suggest(req);
    }

    /** How well the gifts the shopper chose go together. */
    @PostMapping("/check")
    public CheckResponse check(@Valid @RequestBody CheckRequest req) {
        return boxes.check(req);
    }
}
