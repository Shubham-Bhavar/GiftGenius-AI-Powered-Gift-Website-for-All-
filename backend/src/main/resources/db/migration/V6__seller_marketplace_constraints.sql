-- Marketplace follow-ups (additive only).

-- Store names are unique. The column's collation (utf8mb4_unicode_ci) is case-insensitive, so this matches the
-- API's own check and closes the gap when two sellers pick the same name at the same moment.
ALTER TABLE seller_profiles ADD CONSTRAINT uk_seller_store_name UNIQUE (store_name);

-- Store admin's review queue: products in one status, oldest change first.
ALTER TABLE products ADD INDEX idx_products_status_updated (status, updated_at);
