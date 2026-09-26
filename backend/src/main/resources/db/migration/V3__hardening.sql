-- Production hardening

-- Refresh-token rotation grace: a token rotated moments ago (e.g. by another tab) may still be
-- exchanged once more instead of being treated as stolen.
ALTER TABLE refresh_tokens ADD COLUMN rotated_at DATETIME(6) NULL AFTER revoked_at;

-- Per-customer coupon limits.
ALTER TABLE coupons ADD COLUMN per_user_limit INT NULL AFTER used_count;
UPDATE coupons SET per_user_limit = 1, usage_limit = 5000 WHERE code = 'WELCOME';
UPDATE coupons SET per_user_limit = 1, usage_limit = 1000 WHERE code = 'GIFT20';

ALTER TABLE orders ADD INDEX idx_orders_user_coupon (user_id, coupon_code);
ALTER TABLE orders ADD INDEX idx_orders_user_status (user_id, status);

-- Password reset. Only the SHA-256 of the emailed token is stored.
CREATE TABLE password_reset_tokens (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT      NOT NULL,
  token_hash CHAR(64)    NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at    DATETIME(6),
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT uk_pwreset_hash UNIQUE (token_hash),
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_pwreset_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
