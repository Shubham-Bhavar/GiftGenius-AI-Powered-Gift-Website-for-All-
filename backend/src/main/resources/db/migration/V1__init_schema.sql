-- GiftGenius core schema (MySQL 8+)

CREATE TABLE users (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(20),
  role          VARCHAR(20)  NOT NULL,
  enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME(6)  NOT NULL,
  updated_at    DATETIME(6)  NOT NULL,
  CONSTRAINT uk_users_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT      NOT NULL,
  token_hash  CHAR(64)    NOT NULL,
  expires_at  DATETIME(6) NOT NULL,
  revoked_at  DATETIME(6),
  created_at  DATETIME(6) NOT NULL,
  CONSTRAINT uk_refresh_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  slug             VARCHAR(160)  NOT NULL,
  name             VARCHAR(150)  NOT NULL,
  category         VARCHAR(40)   NOT NULL,
  description      VARCHAR(500)  NOT NULL,
  long_description TEXT,
  price            DECIMAL(10,2) NOT NULL,
  original_price   DECIMAL(10,2) NOT NULL,
  rating           DECIMAL(2,1)  NOT NULL DEFAULT 0.0,
  review_count     INT           NOT NULL DEFAULT 0,
  image_url        VARCHAR(1000) NOT NULL,
  alt_text         VARCHAR(255),
  badge_text       VARCHAR(40),
  badge_class      VARCHAR(40),
  stock            INT           NOT NULL DEFAULT 0,
  active           BOOLEAN       NOT NULL DEFAULT TRUE,
  cultural         BOOLEAN       NOT NULL DEFAULT FALSE,
  festival         BOOLEAN       NOT NULL DEFAULT FALSE,
  version          BIGINT        NOT NULL DEFAULT 0,
  created_at       DATETIME(6)   NOT NULL,
  updated_at       DATETIME(6)   NOT NULL,
  CONSTRAINT uk_products_slug UNIQUE (slug),
  CONSTRAINT ck_products_stock CHECK (stock >= 0),
  CONSTRAINT ck_products_price CHECK (price >= 0),
  INDEX idx_products_category (category),
  INDEX idx_products_active_price (active, price)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_tags (
  product_id BIGINT      NOT NULL,
  tag        VARCHAR(40) NOT NULL,
  PRIMARY KEY (product_id, tag),
  CONSTRAINT fk_ptag_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  INDEX idx_ptag_tag (tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_occasions (
  product_id BIGINT      NOT NULL,
  occasion   VARCHAR(40) NOT NULL,
  PRIMARY KEY (product_id, occasion),
  CONSTRAINT fk_pocc_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  INDEX idx_pocc_occasion (occasion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_for_whom (
  product_id BIGINT      NOT NULL,
  for_whom   VARCHAR(20) NOT NULL,
  PRIMARY KEY (product_id, for_whom),
  CONSTRAINT fk_pfw_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_personalities (
  product_id  BIGINT      NOT NULL,
  personality VARCHAR(30) NOT NULL,
  PRIMARY KEY (product_id, personality),
  CONSTRAINT fk_ppers_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_relationships (
  product_id   BIGINT      NOT NULL,
  relationship VARCHAR(30) NOT NULL,
  PRIMARY KEY (product_id, relationship),
  CONSTRAINT fk_prel_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE carts (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT      NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  CONSTRAINT uk_carts_user UNIQUE (user_id),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cart_items (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  cart_id        BIGINT       NOT NULL,
  product_id     BIGINT       NOT NULL,
  quantity       INT          NOT NULL,
  custom_name    VARCHAR(80),
  custom_message VARCHAR(300),
  CONSTRAINT fk_citem_cart FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
  CONSTRAINT fk_citem_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT ck_citem_qty CHECK (quantity BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wishlist_items (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT      NOT NULL,
  product_id BIGINT      NOT NULL,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT uk_wishlist_user_product UNIQUE (user_id, product_id),
  CONSTRAINT fk_wish_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_wish_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupons (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(40)   NOT NULL,
  type             VARCHAR(10)   NOT NULL,
  discount_value   DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount     DECIMAL(10,2),
  usage_limit      INT,
  used_count       INT           NOT NULL DEFAULT 0,
  valid_from       DATETIME(6),
  valid_until      DATETIME(6),
  active           BOOLEAN       NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_coupons_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_number        VARCHAR(20)   NOT NULL,
  user_id             BIGINT        NOT NULL,
  status              VARCHAR(30)   NOT NULL,
  payment_method      VARCHAR(20)   NOT NULL,
  payment_status      VARCHAR(20)   NOT NULL,
  delivery_type       VARCHAR(20)   NOT NULL,
  subtotal            DECIMAL(10,2) NOT NULL,
  discount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total               DECIMAL(10,2) NOT NULL,
  coupon_code         VARCHAR(40),
  ship_full_name      VARCHAR(120)  NOT NULL,
  ship_email          VARCHAR(255)  NOT NULL,
  ship_phone          VARCHAR(20)   NOT NULL,
  ship_address_line   VARCHAR(300)  NOT NULL,
  ship_city           VARCHAR(80)   NOT NULL,
  ship_state          VARCHAR(80),
  ship_pincode        VARCHAR(10)   NOT NULL,
  razorpay_order_id   VARCHAR(64),
  razorpay_payment_id VARCHAR(64),
  idempotency_key     VARCHAR(64),
  version             BIGINT        NOT NULL DEFAULT 0,
  created_at          DATETIME(6)   NOT NULL,
  updated_at          DATETIME(6)   NOT NULL,
  CONSTRAINT uk_orders_number UNIQUE (order_number),
  CONSTRAINT uk_orders_rzp UNIQUE (razorpay_order_id),
  CONSTRAINT uk_orders_idem UNIQUE (user_id, idempotency_key),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users (id),
  INDEX idx_orders_user_created (user_id, created_at),
  INDEX idx_orders_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT        NOT NULL,
  product_id     BIGINT        NOT NULL,
  product_name   VARCHAR(150)  NOT NULL,
  image_url      VARCHAR(1000),
  unit_price     DECIMAL(10,2) NOT NULL,
  quantity       INT           NOT NULL,
  line_total     DECIMAL(10,2) NOT NULL,
  custom_name    VARCHAR(80),
  custom_message VARCHAR(300),
  CONSTRAINT fk_oitem_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_oitem_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_events (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id   BIGINT       NOT NULL,
  status     VARCHAR(30)  NOT NULL,
  note       VARCHAR(255),
  created_at DATETIME(6)  NOT NULL,
  CONSTRAINT fk_oevent_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  INDEX idx_oevent_order (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE newsletter_subscribers (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  created_at DATETIME(6)  NOT NULL,
  CONSTRAINT uk_newsletter_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
