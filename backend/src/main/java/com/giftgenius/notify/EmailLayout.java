package com.giftgenius.notify;

import java.util.List;

import org.springframework.web.util.HtmlUtils;

/**
 * The GiftGenius look for HTML emails: one centred card on the site's light teal, a dark teal header with the gold
 * wordmark, and plain tables and inline styles only, which is what mail clients render reliably. No images, scripts,
 * web fonts or tracking: nothing is fetched when the email is opened.
 *
 * <p>Every value that isn't written here must go through {@link #esc}: product, store and customer names are
 * people's own text.
 */
public final class EmailLayout {

    private static final String INK = "#0F2225";
    private static final String MUTED = "#4A6266";
    private static final String GOLD = "#D4AF37";
    private static final String GOLD_TEXT = "#8F5C0E";
    private static final String PAGE = "#E6F7FA";
    private static final String RULE = "#D0EFF5";
    private static final String FONT = "font-family:Georgia,'Times New Roman',serif;";
    private static final String SANS = "font-family:Arial,Helvetica,sans-serif;";

    private EmailLayout() {
    }

    /** Text made safe to place in HTML (element content or a quoted attribute). Null becomes empty. */
    public static String esc(String text) {
        return text == null ? "" : HtmlUtils.htmlEscape(text, "UTF-8");
    }

    /**
     * A complete HTML document. {@code title} and {@code preheader} (the preview line mail clients show beside the
     * subject) are plain text and escaped here; {@code content} is HTML built from the helpers below.
     */
    public static String document(String title, String preheader, String content) {
        return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
                + "<meta name=\"color-scheme\" content=\"light\">\n<title>" + esc(title) + "</title>\n</head>\n"
                + "<body style=\"margin:0;padding:0;background:" + PAGE + ";\">\n"
                + "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:" + PAGE + ";\">"
                + esc(preheader) + "</div>\n"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:"
                + PAGE + ";\">\n<tr><td align=\"center\" style=\"padding:24px 12px;\">\n"
                + "<table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" "
                + "style=\"width:100%;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;\">\n"
                + "<tr><td style=\"background:" + INK + ";padding:22px 28px;\">"
                + "<span style=\"" + FONT + "font-size:24px;letter-spacing:0.5px;color:" + GOLD + ";\">GiftGenius</span>"
                + "</td></tr>\n"
                + "<tr><td style=\"padding:28px;" + SANS + "font-size:15px;line-height:1.55;color:" + INK + ";\">\n"
                + content
                + "</td></tr>\n"
                + "<tr><td style=\"padding:18px 28px;border-top:1px solid " + RULE + ";" + SANS
                + "font-size:12px;line-height:1.5;color:" + MUTED + ";\">"
                + "This is a service email about an order on GiftGenius. Please don’t reply to it.</td></tr>\n"
                + "</table>\n</td></tr>\n</table>\n</body>\n</html>\n";
    }

    /** The email's main heading. Plain text, escaped here. */
    public static String heading(String text) {
        return "<h1 style=\"margin:0 0 14px;" + FONT + "font-size:22px;line-height:1.3;font-weight:normal;color:" + INK
                + ";\">" + esc(text) + "</h1>\n";
    }

    /** A section heading. Plain text, escaped here. */
    public static String section(String text) {
        return "<h2 style=\"margin:26px 0 8px;" + SANS + "font-size:13px;letter-spacing:1px;text-transform:uppercase;"
                + "color:" + GOLD_TEXT + ";\">" + esc(text) + "</h2>\n";
    }

    /** A paragraph. Plain text, escaped here; line breaks are kept. */
    public static String paragraph(String text) {
        return "<p style=\"margin:0 0 14px;\">" + esc(text).replace("\n", "<br>") + "</p>\n";
    }

    /** A smaller, quieter paragraph. Plain text, escaped here. */
    public static String note(String text) {
        return "<p style=\"margin:14px 0 0;font-size:13px;color:" + MUTED + ";\">" + esc(text).replace("\n", "<br>")
                + "</p>\n";
    }

    /** A call-to-action button, with the address shown beneath it for clients that hide buttons. */
    public static String button(String label, String url) {
        String href = esc(url);
        return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:24px 0 6px;\"><tr>"
                + "<td style=\"background:" + INK + ";border-radius:6px;\">"
                + "<a href=\"" + href + "\" style=\"display:inline-block;padding:12px 22px;" + SANS
                + "font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;\">" + esc(label) + "</a>"
                + "</td></tr></table>\n"
                + "<p style=\"margin:0;font-size:12px;color:" + MUTED + ";word-break:break-all;\">" + href + "</p>\n";
    }

    /** Label and value rows ("Order", "GG-1234"). Each row is {label, value}; both plain text, escaped here. */
    public static String details(List<String[]> rows) {
        StringBuilder out = new StringBuilder("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" "
                + "cellspacing=\"0\" style=\"margin:0 0 4px;\">\n");
        for (String[] row : rows) {
            out.append("<tr><td style=\"padding:4px 12px 4px 0;width:38%;vertical-align:top;color:").append(MUTED)
                    .append(";\">").append(esc(row[0])).append("</td><td style=\"padding:4px 0;vertical-align:top;\">")
                    .append(esc(row[1]).replace("\n", "<br>")).append("</td></tr>\n");
        }
        return out.append("</table>\n").toString();
    }

    /**
     * A table of lines with an amount (or other short value) on the right. Each row is {text, smaller text or null,
     * right-hand value or null}; all plain text, escaped here. {@code totals} are shown beneath, the last one bold.
     */
    public static String lines(List<String[]> rows, List<String[]> totals) {
        StringBuilder out = new StringBuilder("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" "
                + "cellspacing=\"0\" style=\"border-top:1px solid " + RULE + ";\">\n");
        for (String[] row : rows) {
            out.append("<tr><td style=\"padding:10px 12px 10px 0;border-bottom:1px solid ").append(RULE)
                    .append(";vertical-align:top;\">").append(esc(row[0]));
            if (row[1] != null) {
                out.append("<br><span style=\"font-size:13px;color:").append(MUTED).append(";\">").append(esc(row[1]))
                        .append("</span>");
            }
            out.append("</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid ").append(RULE)
                    .append(";vertical-align:top;white-space:nowrap;\">").append(esc(row[2])).append("</td></tr>\n");
        }
        for (int i = 0; i < totals.size(); i++) {
            boolean last = i == totals.size() - 1;
            String weight = last ? "font-weight:bold;font-size:16px;" : "color:" + MUTED + ";";
            out.append("<tr><td align=\"right\" style=\"padding:").append(last ? "10px" : "6px")
                    .append(" 12px 0 0;").append(weight).append("\">").append(esc(totals.get(i)[0]))
                    .append("</td><td align=\"right\" style=\"padding:").append(last ? "10px" : "6px")
                    .append(" 0 0;white-space:nowrap;").append(weight).append("\">").append(esc(totals.get(i)[1]))
                    .append("</td></tr>\n");
        }
        return out.append("</table>\n").toString();
    }
}
