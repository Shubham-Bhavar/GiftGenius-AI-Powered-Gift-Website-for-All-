-- Branded HTML for order emails (additive only: one nullable column, no change to existing rows).
--
-- body_html is the HTML alternative of body_text. An email with both is sent as multipart/alternative; rows queued
-- before this migration, and emails without HTML, keep body_html NULL and are sent as plain text as before.
ALTER TABLE email_outbox ADD COLUMN body_html MEDIUMTEXT NULL AFTER body_text;
