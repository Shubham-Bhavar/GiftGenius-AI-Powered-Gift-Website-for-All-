package com.giftgenius.common;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

import org.springframework.util.StringUtils;

/**
 * Rules for text that one user writes and other users read (store and product details). The frontend renders
 * such text as plain text; on top of that the API refuses markup, and accepts only https image links.
 */
public final class SafeText {

    /** Bean Validation pattern: no angle brackets, so no HTML tags. Line breaks are fine. */
    public static final String NO_MARKUP = "^[^<>]*$";
    public static final String NO_MARKUP_MESSAGE = "Remove the < and > characters";

    /** Bean Validation pattern for an optional image link: blank, or https:// without spaces, quotes or brackets. */
    public static final String HTTPS_URL = "^$|^https://[^\\s<>\"'`]{4,990}$";
    public static final String HTTPS_URL_MESSAGE = "Use an image link that starts with https://";

    private SafeText() {
    }

    /** Trimmed text, or null when blank. */
    public static String clean(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    /** A trimmed https URL with a real host, or null when blank; anything else is a 400. */
    public static String httpsUrl(String raw, String field) {
        String url = clean(raw);
        if (url == null) {
            return null;
        }
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost();
            if (!"https".equals(scheme) || host == null || !host.contains(".") || uri.getUserInfo() != null) {
                throw ApiException.badRequest(field + ": " + HTTPS_URL_MESSAGE + ".");
            }
            return url;
        } catch (URISyntaxException e) {
            throw ApiException.badRequest(field + ": " + HTTPS_URL_MESSAGE + ".");
        }
    }

    /** Lower-case, dash-separated slug from a name ("Shubham's Gifts & Co." becomes "shubhams-gifts-and-co"). */
    public static String slugOf(String name, String fallback) {
        String base = name.toLowerCase(Locale.ROOT).replace("&", "and").replace("'", "")
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (base.length() > 60) {
            base = base.substring(0, 60).replaceAll("-$", "");
        }
        return base.isEmpty() ? fallback : base;
    }
}
