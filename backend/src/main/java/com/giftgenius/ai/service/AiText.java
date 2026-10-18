package com.giftgenius.ai.service;

import java.util.regex.Pattern;

import org.springframework.util.StringUtils;

/** Text going into prompts and coming out of the model, made safe for each side. */
final class AiText {

    /** Links and markup: the model has no reason to send either to a shopper. */
    private static final Pattern LINK_OR_MARKUP = Pattern.compile("(?i)https?://|www\\.|<[a-z/!]|\\]\\(");

    private AiText() {
    }

    /** One line of plain text: control characters dropped, whitespace collapsed, cut at a word boundary to max. */
    static String clean(String s, int max) {
        if (s == null) {
            return "";
        }
        String t = s.replaceAll("[\\p{Cntrl}&&[^\n]]", "").replaceAll("\\s+", " ").trim();
        if (t.length() <= max) {
            return t;
        }
        int cut = t.lastIndexOf(' ', max - 1);
        return t.substring(0, cut > max / 2 ? cut : max - 1).trim() + "…";
    }

    /** A value placed on its own prompt line: one line, no tags, no column separators, bounded. */
    static String field(String s, int max) {
        return s == null ? "" : clean(s.replace('<', ' ').replace('>', ' ').replace('|', '/'), max);
    }

    /** The shopper's free text, kept inside its delimiters: no angle brackets, no control characters. */
    static String notes(String notes) {
        if (!StringUtils.hasText(notes)) {
            return "(none)";
        }
        return notes.replace('<', ' ').replace('>', ' ').replaceAll("[\\p{Cntrl}&&[^\n]]", "").trim();
    }

    /** Text the model wrote for the shopper: cleaned and bounded, or "" when it carries a link or markup. */
    static String forShopper(String s, int max) {
        String t = clean(s, max);
        return LINK_OR_MARKUP.matcher(t).find() ? "" : t;
    }
}
