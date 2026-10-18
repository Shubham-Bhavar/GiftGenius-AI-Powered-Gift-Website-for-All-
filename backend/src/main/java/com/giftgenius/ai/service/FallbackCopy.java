package com.giftgenius.ai.service;

import java.util.List;

import org.springframework.util.StringUtils;

/** What the AI features say when no model answers: warm, fixed copy per occasion. */
final class FallbackCopy {

    private FallbackCopy() {
    }

    /** One card message for the occasion (canonical, e.g. "festival"; null for none). */
    static String giftMessage(String occasion) {
        if (occasion == null) {
            return "A little something to remind you how much you mean to me.";
        }
        return switch (occasion) {
            case "birthday" -> "Happy birthday! Here's to a year as wonderful as you are.";
            case "anniversary" -> "Happy anniversary. Every year with you is my favourite gift.";
            case "festival" -> "Wishing you light, laughter and sweetness this festive season.";
            case "graduation" -> "Congratulations, graduate! So proud of you. The best is just beginning.";
            case "valentine" -> "Happy Valentine's Day to the one who makes every day brighter.";
            default -> "A little something to remind you how much you mean to me.";
        };
    }

    /** Three card messages, signed with the sender's name when given. */
    static List<String> giftMessages(String occasion, String senderName) {
        String sign = StringUtils.hasText(senderName) ? " With love, " + senderName.trim() + "." : "";
        return List.of(
                giftMessage(occasion) + sign,
                "Thinking of you today and always. Hope this brings a big smile." + sign,
                "Because you deserve something special, just like you." + sign);
    }
}
