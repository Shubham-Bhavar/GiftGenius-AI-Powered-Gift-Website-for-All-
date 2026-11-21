-- GG-45: the guest-cart merge at sign-in, safe to retry. Additive only: one new table, no change to existing rows.
--
-- The browser sends an Idempotency-Key with each merge of one guest cart; the first merge under a key is recorded
-- here, in the same transaction as the lines it adds, and a repeat of the same key (a retry after a lost response,
-- a second tab) changes nothing. Rows are a few bytes each and go with the user.
CREATE TABLE cart_merges (
  user_id    BIGINT      NOT NULL,
  merge_key  VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, merge_key),
  CONSTRAINT fk_cart_merge_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
