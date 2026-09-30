-- Marketplace: sellers own products, and order lines remember which seller fulfils them.
-- Existing products keep seller_id NULL (sold by GiftGenius) and are marked APPROVED, so they stay exactly as they were.

-- One store per seller account; the primary key is the seller's user id.
CREATE TABLE seller_profiles (
  user_id           BIGINT        NOT NULL PRIMARY KEY,
  slug              VARCHAR(80)   NOT NULL,
  store_name        VARCHAR(80)   NOT NULL,
  description       VARCHAR(1000),
  business_category VARCHAR(40)   NOT NULL,
  phone             VARCHAR(20)   NOT NULL,
  support_email     VARCHAR(255),
  address_line      VARCHAR(300)  NOT NULL,
  city              VARCHAR(80)   NOT NULL,
  state             VARCHAR(80)   NOT NULL,
  pincode           VARCHAR(10)   NOT NULL,
  logo_url          VARCHAR(1000),
  banner_url        VARCHAR(1000),
  status            VARCHAR(20)   NOT NULL,
  status_reason     VARCHAR(500),
  reviewed_at       DATETIME(6),
  version           BIGINT        NOT NULL DEFAULT 0,
  created_at        DATETIME(6)   NOT NULL,
  updated_at        DATETIME(6)   NOT NULL,
  CONSTRAINT uk_seller_slug UNIQUE (slug),
  CONSTRAINT fk_seller_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_seller_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product ownership and review state. A product can only be listed (active) once it is approved.
ALTER TABLE products
  ADD COLUMN seller_id        BIGINT       NULL AFTER id,
  ADD COLUMN status           VARCHAR(20)  NOT NULL DEFAULT 'APPROVED' AFTER active,
  ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER status,
  ADD CONSTRAINT fk_product_seller FOREIGN KEY (seller_id) REFERENCES seller_profiles (user_id),
  ADD INDEX idx_products_seller_status (seller_id, status),
  ADD CONSTRAINT ck_products_listed_only_if_approved CHECK (active = FALSE OR status = 'APPROVED');

-- Each order line keeps its seller (a snapshot, like product_name) and that seller's fulfilment progress.
-- GiftGenius's own lines keep seller_id and fulfillment_status NULL and follow the order status.
ALTER TABLE order_items
  ADD COLUMN seller_id              BIGINT       NULL AFTER product_id,
  ADD COLUMN fulfillment_status     VARCHAR(20)  NULL AFTER custom_message,
  ADD COLUMN fulfillment_note       VARCHAR(255) NULL AFTER fulfillment_status,
  ADD COLUMN fulfillment_updated_at DATETIME(6)  NULL AFTER fulfillment_note,
  ADD CONSTRAINT fk_oitem_seller FOREIGN KEY (seller_id) REFERENCES seller_profiles (user_id),
  ADD INDEX idx_oitem_seller_order (seller_id, order_id);
