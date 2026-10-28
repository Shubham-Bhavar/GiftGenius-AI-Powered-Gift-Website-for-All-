# GiftGenius repository audit

Audit date: 2026-10-28. Scope: the local Git checkout only. Nothing was fetched, pushed, merged or deployed, and no hosted service (Railway, Vercel, production MySQL, Razorpay, Gemini) was contacted.

Related documents: [BUG_REGISTER.md](BUG_REGISTER.md) · [TEST_RESULTS.md](TEST_RESULTS.md) · [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) · [DEVELOPMENT_HANDOFF.md](DEVELOPMENT_HANDOFF.md)

## 1. Method

1. Read the build, runtime, CI, Docker and deployment configuration, the migrations and the test suites.
2. Ran every supported check before changing anything (baseline), then again after the fixes. See TEST_RESULTS.md.
3. Read the backend by risk: security and auth, payments and orders, pricing, cart, catalogue, AI, admin, seller, then the frontend's API client, routing, checkout and auth flows.
4. Reproduced suspected defects with a failing automated test before fixing them, where the defect could be reproduced.
5. Ran the application locally (backend jar on an isolated scratch MySQL, Vite dev server) and drove the main journeys in a browser and with HTTP calls.

## 2. Repository state

| Item | State |
|---|---|
| Checkout | `C:\Users\Admin\Desktop\gifgenius\giftgenius-v5-production\giftgenius` |
| Remote | `origin` → `github.com/Shubham-Bhavar/GiftGenius-AI-Powered-Gift-Website-for-All-` |
| Last fetch | 2026-10-13 (local `.git/FETCH_HEAD`); not refreshed for this audit |
| `origin/main` (as of that fetch) | `9fcb5b3` (2026-10-01) "feat: harden Razorpay UPI payments and the AI gift advisor" |
| `refactor/architecture` | `5074d69`: 21 commits on top of `origin/main`; 1 local commit (`5074d69`, tests only) was never pushed. `origin/refactor/architecture` is `d80d4c0` |
| `feat/seller-marketplace`, `feat/entry-auth-guest-location` | both already contained in `origin/main` |
| Audit branch | `audit/production-readiness`, created locally from `5074d69`. All changes of this audit are in one local commit on it, not pushed |

**Merged refactor.** The owner reports that the refactor was merged into `main`. The local refs predate that merge (they show `refactor/architecture` 21 commits ahead of `origin/main`), so it can't be confirmed from local state. This audit was done on the refactor code (`5074d69`), which is the closest local equivalent of the merged `main`: if PR #2 was merged as pushed, `main` equals `d80d4c0`, and `5074d69` adds one tests-only commit.

**Not in the repository.** Older full copies of the project sit next to the checkout (`C:\Users\Admin\Desktop\gifgenius\giftgenius\giftgenius`, `giftgenius-v3-production`, several `.zip` files). One of them contains a `.env` file. It was not opened; see BUG_REGISTER GG-16.

## 3. Architecture

```
Browser (React 19 SPA)
  │  same origin /api (nginx or Vite proxy)  ── or ──  VITE_API_BASE (Vercel → Railway, cross-site)
  ▼
Spring Boot 4.1.1 API (Java 21, virtual threads)         port 8080 (PORT); actuator on 9091 (MANAGEMENT_PORT)
  ├─ Spring Security: stateless JWT (15 min) + rotating refresh cookie (httpOnly, /api/auth)
  ├─ Rate limiter (per client IP, in memory)
  ├─ JPA/Hibernate (ddl-auto=validate) ── Flyway V1–V6 ──▶ MySQL 8
  ├─ Gemini REST (optional; rule-based fallback)    ├─ Razorpay REST + webhook (optional; COD otherwise)
  ├─ SMTP (optional; logs otherwise)                └─ OpenStreetMap Nominatim (optional address lookup)
```

| Layer | Technology (versions from the manifests) |
|---|---|
| Frontend | React 19.3, React Router 7.18 (data router, lazy routes), TanStack Query 5.103, Vite 8.3, Vitest 5, MSW 2, axe-core |
| Backend | Spring Boot 4.1.1 (webmvc, security, data-jpa, validation, actuator, cache, mail, flyway), jjwt 0.13, springdoc 3.1.1, Lombok, Micrometer Prometheus |
| Database | MySQL 8 (8.4 in CI and Docker; 8.0.43 used locally for this audit), Flyway 6 versioned migrations |
| Delivery | Dockerfiles for both apps, `docker-compose.yml` (MySQL + API + nginx) and `docker-compose.prod.yml` (Caddy HTTPS + nightly backups), `frontend/vercel.json`, GitHub Actions `ci.yml` |

### Backend packages

| Package | Responsibility |
|---|---|
| `auth` | register, login, refresh rotation with a 30 s reuse grace, logout, profile, password change/reset, seller application |
| `security`, `config` | JWT service and filter, per-IP rate limiter, security chain and CORS, typed `app.*` properties, HTTP clients with timeouts, admin bootstrap |
| `catalog` | public catalogue (search, filters, sort, paging, related, categories), admin and seller product management |
| `cart`, `wishlist` | server cart and wishlist, guest merge at sign-in; writes serialised per user with a row lock |
| `pricing` | server-side quote (prices, coupons, delivery fees), coupon admin |
| `order` | placement (stock and coupon reservation, idempotency), cancellation, admin and seller fulfilment, unpaid-order expiry |
| `payment` | Razorpay order creation, browser verification (HMAC), webhook (HMAC, amount and currency check) |
| `ai`, `recommendation`, `search` | Gemini provider behind a daily budget, orchestration with validation, rule-based ranking engine, gift-aware search |
| `seller`, `admin`, `contact`, `newsletter`, `location`, `notify`, `analytics` | marketplace stores, admin stats, contact inbox, newsletter, reverse geocoding, mail, a no-op interaction hook |

## 4. API surface

Every route below was read from the controller mappings (not from documentation). Frontend calls were matched against them: every path the frontend calls exists, with the same method. The route annotations differ from `origin/main` only by relocation (payment verify moved controller, same URL) and two additions (`/api/search`, `/api/ai/gift-request`), and the frontend's API paths are identical on both, so no deployed-version mismatch causes 404s.

| Area | Routes | Access |
|---|---|---|
| Auth | `POST /api/auth/register · login · refresh · logout · password/forgot · password/reset` | public (refresh/logout need `X-Requested-With: GiftGenius`) |
| Account | `GET/PATCH /api/auth/me`, `POST /api/auth/password/change · seller-application` | signed in |
| Catalogue | `GET /api/products`, `/api/products/{id}`, `/{id}/related`, `/categories`, `/api/stores/{slug}`, `/api/search` | public |
| Cart / wishlist | `/api/cart/**`, `/api/wishlist/**` | signed in |
| Checkout | `GET /api/checkout/options`, `POST /api/checkout/quote` | public |
| Orders | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/{n}`, `POST /api/orders/{n}/cancel`, `POST /api/orders/{n}/payment/verify` | signed in, own orders only |
| Tracking | `GET /api/orders/track?orderNumber&email` | public, rate-limited |
| AI | `POST /api/ai/recommendations · gift-message · gift-request` | public, rate-limited, daily model budget |
| Payments | `POST /api/payments/razorpay/webhook` | public, HMAC-verified; 404 when not configured |
| Admin | `/api/admin/products · orders · coupons · stats · messages · sellers` | ADMIN role |
| Seller | `/api/seller/**` | SELLER role, plus store status read from the database |
| Other | `POST /api/contact`, `POST /api/newsletter/subscribe` (public, rate-limited), `POST /api/location/reverse` (signed in) |

Errors are RFC 9457 problem details. Unknown `/api` paths answer **401** to anonymous callers (the security chain runs before routing) and 404 to signed-in callers; keep that in mind when reading old "404" reports.

## 5. Frontend routes

| Route | Screen | API used |
|---|---|---|
| `/` | Home (hero, occasions, trending, Gift Finder pop-up, newsletter) | products (first 100), AI recommendations, newsletter |
| `/shop`, `/collections`, `/store/:slug` | Shop with filters, sort and paging; collections; seller storefront | products, categories, stores |
| `/product/:id` | Product page with personalisation and AI card messages | product, related, AI gift message |
| `/gift-finder` | Six-question AI quiz | AI recommendations |
| `/cart`, `/checkout` (signed in) | Cart, server quote, checkout, Razorpay or COD | quote, options, orders, payment verify |
| `/wishlist`, `/track` | Wishlist (guest or account), public tracking | wishlist, track |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth pages (also a header modal) | auth |
| `/account`, `/account/orders`, `/account/orders/:number` | Account settings, order history and detail | auth, orders |
| `/seller/**`, `/admin/**` | Seller Center and Store admin (lazy chunks, role-gated in the UI and the API) | seller, admin |
| `/about`, `/contact`, `/help`, `/privacy`, `/terms`, `*` | Info pages and a 404 page | contact |

Deep links work on both hosts: nginx `try_files … /index.html` and the Vercel rewrite to `/index.html`.

## 6. Database

Tables: `users`, `refresh_tokens`, `password_reset_tokens`, `products` (+ `product_tags`, `product_occasions`, `product_for_whom`, `product_personalities`, `product_relationships`), `carts`, `cart_items`, `wishlist_items`, `coupons`, `orders`, `order_items`, `order_status_events`, `newsletter_subscribers`, `contact_messages`, `seller_profiles`.

- Flyway owns the schema; Hibernate only validates it (`ddl-auto: validate`). V1 schema, V2 seed catalogue and coupons, V3 token rotation and indexes, V4 occasions and contact, V5 marketplace columns, V6 marketplace constraints. No migration drops, renames or deletes data.
- **The migration files are byte-identical on `origin/main` and this branch**, so a database already migrated by `main` validates against this code (no checksum mismatch). This audit adds no migration.
- Integrity: unique keys on emails, slugs, store names and `(user_id, idempotency_key)` on orders; a `CHECK` that a listed product is approved; stock and coupon use reserved with conditional `UPDATE`s; order, user and store rows locked where races matter.
- Flyway Community has no undo: rolling back a release that adds a migration needs a forward migration or a restore from backup.

## 7. Feature status

| Feature | Status | Evidence |
|---|---|---|
| Catalogue, categories, search, filters, occasions, product pages | Implemented, verified | IT + browser + HTTP checks |
| Guest cart and wishlist (localStorage), merge at sign-in | Implemented, verified | frontend tests + browser (merge called once) |
| Auth (JWT + refresh cookie), password reset, account | Implemented, verified locally | IT + browser (session survives reload) |
| Checkout, COD orders, coupons, delivery fees | Implemented, verified | IT + browser order `GG-PTGRH2AK` |
| Razorpay online payment | Implemented; verified only against a fake Razorpay server and mocks | PaymentIT; real test-mode window BLOCKED (no test keys) |
| AI quiz, card messages, free-text gift request | Implemented; Gemini path verified only with a mocked provider; rule fallback verified live | AiIT, unit tests, browser (`source: rules`) |
| Gift-aware search `/api/search`, `/api/ai/gift-request` | Backend only (not used by the storefront) | controllers, SearchIT, AiIT |
| Marketplace (sellers, store review, product approval, split orders) | Implemented, verified by tests | SellerMarketplaceIT, seller.test.jsx |
| Admin (orders, products, coupons, messages, sellers, stats) | Implemented; authorization verified live | IT + HTTP checks |
| Email | Implemented; without SMTP it logs (verified) | MailerTest, startup log |
| Address lookup (Nominatim) | Implemented; disabled in the local run, fake server in IT | LocationIT |
| Analytics events | Extension point only (`NoOpInteractionRecorder`) | analytics package |
| AI tool use (`docs/ai-tools.md`) | Design document only, no code | docs |

## 8. Environment variables (names and purpose only)

Backend (`application.yml`; most are listed in `.env.example`):

| Variables | Purpose |
|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `DB_POOL_SIZE` | MySQL connection and Hikari pool size |
| `MYSQL_ROOT_PASSWORD`, `BACKUP_KEEP_DAYS` | Docker MySQL container and nightly backups |
| `PORT`, `MANAGEMENT_PORT` | API port; actuator (health, Prometheus) port, never exposed by nginx |
| `JWT_SECRET` (required, ≥ 32 bytes), `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `REFRESH_REUSE_GRACE`, `PASSWORD_RESET_TTL` | tokens |
| `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `CORS_ALLOWED_ORIGINS` | refresh cookie flags; cross-origin browser access (Vercel → Railway needs `None` + the Vercel origin) |
| `APP_PUBLIC_URL`, `DOMAIN`, `WEB_PORT` | links in emails; Caddy HTTPS domain; local nginx port |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12 chars), `ADMIN_NAME` | admin account checked at every start |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`, `MAIL_FROM` | outgoing mail |
| `AI_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL`, `AI_TIMEOUT`, `AI_DAILY_CALL_LIMIT`, `AI_QUOTA_COOLDOWN` | AI advisor and its cost guard |
| `RAZORPAY_ENABLED`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_BASE_URL` | online payment |
| `RATE_LIMIT_AI`, `RATE_LIMIT_AUTH`, `RATE_LIMIT_PUBLIC`, `PENDING_PAYMENT_TTL`, `MAX_PENDING_ORDERS` | abuse limits and unpaid-order rules |
| `GEO_ENABLED`, `GEOCODER_BASE_URL`, `GEOCODER_USER_AGENT`, `GEOCODER_TIMEOUT` | address lookup |
| `API_DOCS_ENABLED`, `LOG_LEVEL` | Swagger UI (keep off in production); log level |

Frontend: `VITE_API_BASE` (build time; the API origin when it isn't the site's own `/api`), `API_PROXY_TARGET` (Vite dev/preview proxy). Tests: `IT_DB_URL`, `IT_DB_USERNAME`, `IT_DB_PASSWORD` (integration tests; **the database is Flyway-cleaned**, so it must be a dedicated test database).

Any Spring property can also be set through its relaxed environment name (for example `SERVER_FORWARD_HEADERS_STRATEGY`), which matters for GG-10.

## 9. Dependencies

- `npm audit` (baseline): 6 advisories, all in development tooling (Vite dev server, Vitest, undici, zod, source-map-js); `npm audit --omit=dev`: 0. After `npm audit fix` (lockfile only, within the declared ranges): 0. See GG-08.
- Backend: no vulnerability database scan was run (OWASP dependency-check needs a large NVD download). Dependencies are managed by the Spring Boot 4.1.1 BOM. Status NOT TESTED.
- `npm outdated`: only patch/minor updates pending within the declared ranges; msw 3 and jsdom are major or engine-sensitive and were left alone.

## 10. Findings

Defects, risks and their status are in [BUG_REGISTER.md](BUG_REGISTER.md): 9 fixed (1 High, 2 Medium, 6 Low), 7 open items that need an owner decision, infrastructure access or further verification.

## 11. Not covered

- Live behaviour of Railway, Vercel, the production database, Razorpay, Gemini and SMTP (no access, by instruction).
- Docker image builds (the Docker daemon isn't running on this machine; compose files were validated).
- Real-browser colour-contrast measurement and screen-reader testing (the automated axe-core checks run in jsdom; layout was checked at 375 px in Chromium).
- Load and performance testing.
