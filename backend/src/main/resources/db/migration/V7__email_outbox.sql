-- Email outbox (additive only: one new table, no change to existing tables or data).
--
-- An order's emails are written here in the same transaction that saves the order or its status, so an email can't
-- exist without its order and can't be lost on a restart. A background sender delivers them afterwards.
--
-- dedupe_key names one email for one recipient about one event (for example "order:12:confirmed:customer"); the
-- unique constraint is what makes a second copy impossible, however many times or places the event is handled.
--
-- status:  PENDING   waiting for its next attempt (next_attempt_at)
--          SENDING   claimed by a sender until locked_until
--          SENT      accepted by the SMTP server (sent_at)
--          FAILED    given up: retries used up, a permanent error, or delivery interrupted (last_error says which)
--          NOT_SENT  no email provider was configured when it came up, so nothing was sent
CREATE TABLE email_outbox (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  dedupe_key      VARCHAR(200)  NOT NULL,
  kind            VARCHAR(40)   NOT NULL,
  order_id        BIGINT,
  recipient       VARCHAR(255)  NOT NULL,
  subject         VARCHAR(255)  NOT NULL,
  body_text       MEDIUMTEXT    NOT NULL,
  status          VARCHAR(20)   NOT NULL,
  attempts        INT           NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6)   NOT NULL,
  locked_until    DATETIME(6),
  last_error      VARCHAR(500),
  sent_at         DATETIME(6),
  created_at      DATETIME(6)   NOT NULL,
  updated_at      DATETIME(6)   NOT NULL,
  CONSTRAINT uk_email_outbox_dedupe UNIQUE (dedupe_key),
  CONSTRAINT fk_email_outbox_order FOREIGN KEY (order_id) REFERENCES orders (id),
  INDEX idx_email_outbox_due (status, next_attempt_at),
  INDEX idx_email_outbox_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
