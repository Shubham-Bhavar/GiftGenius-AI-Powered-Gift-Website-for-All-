-- Occasions used by the homepage "Shop by Occasion" cards that had no catalog data yet.
INSERT INTO product_occasions (product_id, occasion) VALUES
  (1, 'baby'),          -- Luxury Hamper Box: a treat for new parents
  (5, 'baby'),          -- Personalised Memory Journal: baby's first-year journal
  (9, 'baby'),          -- Customised Star Map Print: the night they were born
  (20, 'baby'),         -- Couple Photo Book: new-family photo book
  (2, 'achievement'),   -- Engraved Timepiece
  (5, 'achievement'),   -- Personalised Memory Journal
  (11, 'achievement'),  -- Wireless Earbuds Premium
  (15, 'achievement'),  -- Leather Wallet & Card Holder
  (18, 'achievement');  -- Graduation Memory Box

-- Messages from the Contact page, handled from Store admin → Messages.
CREATE TABLE contact_messages (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120)  NOT NULL,
  email        VARCHAR(255)  NOT NULL,
  topic        VARCHAR(20)   NOT NULL,
  order_number VARCHAR(20),
  message      VARCHAR(2000) NOT NULL,
  handled      BOOLEAN       NOT NULL DEFAULT FALSE,
  handled_at   DATETIME(6),
  created_at   DATETIME(6)   NOT NULL,
  INDEX idx_contact_handled_created (handled, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
