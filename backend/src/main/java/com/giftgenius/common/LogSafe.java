package com.giftgenius.common;

import java.util.regex.Pattern;

/** Personal data and secrets made safe to write to logs. */
public final class LogSafe {

    /** The token in a link such as /reset-password?token=... */
    private static final Pattern LINK_TOKEN = Pattern.compile("(?i)([?&]token=)[^\\s&]+");

    private LogSafe() {
    }

    /** "asha.rao@example.com" → "a***@example.com": enough to tell messages apart, not enough to read the address. */
    public static String email(String email) {
        if (email == null || email.isBlank()) {
            return "(none)";
        }
        String e = email.strip();
        int at = e.indexOf('@');
        return at <= 0 ? "***" : e.charAt(0) + "***" + e.substring(at);
    }

    /** The text with every one-time link token (password reset) replaced by "[redacted]". */
    public static String withoutLinkTokens(String text) {
        return text == null ? null : LINK_TOKEN.matcher(text).replaceAll("$1[redacted]");
    }
}
