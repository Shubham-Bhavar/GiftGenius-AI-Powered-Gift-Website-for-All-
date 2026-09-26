# GiftGenius: AI-powered gift store

A production-ready gift e-commerce site: a **React 19** storefront, a **Spring Boot 4** API on **Java 21**, **MySQL 8** and an **AI gift advisor** (Google Gemini, with a rule-based fallback so it always answers).

The storefront keeps the original GiftGenius homepage ([Shubham-Bhavar/GiftGenius-AI-Powered-Gift-Website-for-All-](https://github.com/Shubham-Bhavar/GiftGenius-AI-Powered-Gift-Website-for-All-)) exactly as designed: the same sections, colours, fonts, gift-box entry animation, confetti, sliding nav pill and cards. Its stylesheet is used verbatim (`frontend/src/styles/giftgenius.css`), and every other page is built from the same design tokens and components (`frontend/src/styles/pages.css`), so the whole site looks and feels like the homepage. All pages are connected to the live API.

```
giftgenius/
├── backend/                Spring Boot 4.1 · Java 21 · MySQL 8 · Flyway · Spring Security (JWT)
├── frontend/               React 19 · Vite 8 · React Router 7 · TanStack Query 5 · modern CSS
├── deploy/                 Caddyfile (automatic HTTPS) and the nightly backup script
├── scripts/                One-time local MySQL setup
├── docker-compose.yml      MySQL + API + nginx (the app and /api on one origin)
├── docker-compose.prod.yml Production overlay: Caddy (HTTPS) + backups
├── .env.example            Every setting, documented
└── .github/workflows/ci.yml
```

## Features

**Pages**: Home, Gifts (`/shop`), product, AI Gift Quiz (`/gift-finder`), Collections, About, Contact, Help & FAQ, Privacy, Terms, cart, checkout (Cart → Details → Payment → Done), wishlist, order tracking, account, my orders and order detail, sign in, register, password reset, a 404 page and the store admin.

**Shoppers**: browse and search with filters (category, occasion, price, sort), product pages with free personalisation (engraved name, card message) and **AI-written card messages**, a guest cart and wishlist that merge into the account at sign-in, server-priced checkout with coupons and three delivery speeds, cash on delivery or Razorpay (UPI, cards, net banking), order history, live tracking, cancellation until dispatch, public order tracking by number and email, password reset and account settings. Light and dark themes, keyboard and screen-reader friendly, and responsive down to phone width.

**AI Gift Finder**: the homepage's four-step Gift Finder pop-up and the full six-question quiz at `/gift-finder` both call the AI advisor. It returns ranked picks with a reason for each, a summary and a ready-to-use card message.

**Contact form**: messages are saved to the database and emailed to `ADMIN_EMAIL` (when SMTP is configured). The store owner reads and closes them in Store admin → Messages.

**Store admin** (`/admin`): sales KPIs, low stock, order management (packed → shipped → delivered, notes shown to the customer, cancellations with automatic stock and coupon release), a product editor, coupon management and the contact-message inbox.

**Store details** (support email, phone, city, social links, nav menu, and the end date on the homepage sale banner) live in one file: `frontend/src/config/site.js`.

## Quick start (Docker)

```bash
cp .env.example .env
# Fill in: DB_PASSWORD, MYSQL_ROOT_PASSWORD, JWT_SECRET (openssl rand -base64 48),
#          ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars). Optional: GEMINI_API_KEY, SMTP_*, RAZORPAY_*
docker compose up --build
```

Open http://localhost:8081. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` and choose **Store admin** from the account menu.

## Production deployment

On a Linux server with Docker, and with your domain's DNS pointing at it (ports 80 and 443 open):

```bash
cp .env.example .env         # also set DOMAIN=shop.example.com and APP_PUBLIC_URL=https://shop.example.com
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- **HTTPS.** Caddy gets and renews the Let's Encrypt certificate, redirects http to https, sends HSTS and forwards to nginx. Only Caddy is published; nginx and the API are internal.
- **Backups.** The `backup` service writes a compressed `mysqldump` to `./backups/` every 24 hours and keeps `BACKUP_KEEP_DAYS` (default 14). Copy that folder off the server, for example with a cron job running `rclone` or `aws s3 sync`. To restore:
  ```bash
  gunzip -c backups/giftgenius-2026-09-25-0300.sql.gz | docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -u root giftgenius
  ```
- **Email.** Set `SMTP_*` and `MAIL_FROM` (for example Amazon SES, Postmark or SendGrid SMTP). Customers get order confirmations, dispatch and delivery updates, cancellations and password-reset links. Without SMTP, messages are written to the backend log.
- **Payments.** Set `RAZORPAY_ENABLED=true` and the keys. Start with `rzp_test_` keys. In the Razorpay dashboard, point a webhook at `https://<your-domain>/api/payments/razorpay/webhook`, subscribe it to `payment.captured`, `order.paid` and `payment.failed`, and set the same secret as `RAZORPAY_WEBHOOK_SECRET`. Refunds for cancelled paid orders show as *Refund in progress*; issue them in the Razorpay dashboard.
- **Monitoring.** The API serves `/actuator/health` (with liveness and readiness probes) and `/actuator/prometheus` on port **9091**, which is never published. Scrape it from inside the Docker network, or attach a Prometheus and Grafana container to the same network. Docker health checks restart unhealthy containers.
- **Scaling out.** Rate limits are kept in memory per API instance. If you run more than one backend replica, move them to Redis (for example Bucket4j) or your API gateway.

## Local development (without Docker)

1. **MySQL 8.** Run `scripts/mysql-local-setup.sql` once as root. It creates the `giftgenius` user and the `giftgenius` and `giftgenius_test` databases.
   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "source scripts/mysql-local-setup.sql"
   ```
2. **Backend** (JDK 21, Maven 3.9+):
   ```bash
   cd backend
   export DB_PASSWORD='the password from the setup script' ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password'
   mvn spring-boot:run -Dspring-boot.run.profiles=dev
   ```
   Flyway creates the schema and seeds the 20-product catalog and two coupons. The `dev` profile supplies a throwaway JWT secret, non-Secure cookies and Swagger UI at http://localhost:8080/swagger-ui.html.
3. **Frontend** (Node 20.19+ or 22):
   ```bash
   cd frontend && npm install && npm run dev
   ```
   Open http://localhost:5173. Vite proxies `/api` to `localhost:8080`, so the setup matches production.

## Tests

```bash
cd backend && mvn verify                  # unit tests (33)
cd backend && IT_DB_PASSWORD=... mvn verify -Pintegration   # + integration tests on real MySQL (37)
cd frontend && npm run lint && npm test   # 65 tests: every page, flow and overlay against a mock of the API, plus axe-core accessibility checks
```

The **integration tests** start the whole application against a real MySQL database, which is Flyway-cleaned first. A local fake Razorpay server stands in for payments, and the LLM is mocked. They cover:
- **Auth:** registration, login, refresh-token rotation with the parallel-tab grace window, logout, the CSRF header, password reset and change, and admin-only routes.
- **Catalog:** search and filters, admin product and coupon management.
- **Cart and checkout:** idempotent COD orders, stock reservation and sell-outs, per-customer coupon limits, cancellation releasing stock and coupons, the admin order lifecycle, public tracking, and parallel cart requests on first sign-in.
- **Payments:** Razorpay signature verification, webhooks (including duplicates and forged signatures), Razorpay outages, and the cap on unpaid orders.
- **AI:** rule fallback, AI re-ranking that discards invented product ids, prompt-injection delimiting, card messages and budget limits.
- **Contact:** validation, the admin inbox and its access rules, and that the sender is never emailed (so the form can't be used to spam people).

The **frontend tests** render the real app, with its router, providers and pages, against an in-memory API built on MSW. They cover:
- the original homepage: hero, occasions, filter pills, sort, live header search, Quick View, the "+ Add → ✓ Added" feedback, the cart sidebar, the newsletter and the once-per-session entry animation;
- guest cart, wishlist and the merge at sign-in;
- the sign-in dialog's modes (sign in, create account, forgot password: each named correctly for screen readers), and the reset-password page: validation, one-time links and missing links;
- the checkout idempotency key, including a retry after a network failure;
- the gift-finder quiz, order tracking and the admin gate;
- output escaping, the image fallback, and the session-refresh rules;
- accessibility with axe-core (WCAG 2.x A/AA and best practices) on all 18 public pages, the signed-in and admin pages, and every overlay while open, plus keyboard behaviour: focus trapping and return, closed overlays kept out of the tab order, and the product tabs' arrow keys.

Colour contrast can't be measured in jsdom, so it was checked with axe-core in a real browser on every page in both light and dark themes.

CI runs all three suites, with MySQL as a service container, and builds the Docker images on every push.

## Architecture notes

- **Pricing is server-authoritative.** The browser sends product ids and quantities only. Prices, coupons and delivery fees are computed on the server and snapshotted into the order.
- **Concurrency.** Stock and coupon uses are reserved with atomic conditional `UPDATE`s, so two shoppers can't buy the last unit. One shopper's cart writes and checkouts are serialised on their user row (say, two tabs, or the guest-cart merge at sign-in). Checkout never holds database locks while calling Razorpay: it reserves, commits, calls Razorpay, then attaches the payment, or cancels and releases stock if Razorpay is down. An `Idempotency-Key` makes "Place order" safe to retry.
- **Auth.** The 15-minute JWT access token is held in memory only. A rotating refresh token lives in an httpOnly, SameSite=Strict cookie scoped to `/api/auth` and is stored hashed. Reusing an old refresh token revokes every session, except within a 30-second grace window: that window lets two tabs refreshing at once both succeed instead of signing you out. The browser also serialises refreshes across tabs with the Web Locks API. Passwords use BCrypt (cost 12), and login takes the same time whether or not the email exists.
- **Rate limits.** Per client IP, for AI calls (10/min), sign-in and password endpoints (20/min), and public lookups such as tracking, newsletter and refresh (30/min). nginx overwrites `X-Forwarded-For` with the real peer address, trusting only the Caddy network, so clients can't spoof their IP.
- **Unpaid online orders** hold stock for 30 minutes, then expire. Each customer can have at most 3 at once, so stock can't be hoarded.
- **AI.** The rule engine shortlists up to 12 in-stock, in-budget products. Gemini re-ranks that shortlist and writes the reasons, the summary and the card message. Product ids the model invents are discarded, and shopper notes are passed as delimited data, not instructions. Any failure or timeout falls back to the rule engine, and the response's `source` (`ai` or `rules`) is shown in the UI.
- **Accessibility.** One h1 per page, labelled landmarks, a skip link, real links on product cards, modals that trap and return focus, and text colours that meet WCAG AA contrast in both themes. Where the brand gold and teal were too light for small text, a deeper shade of the same hue is used (see the end of `pages.css`); buttons, fills and large type keep the original colours.
- **Security headers.** nginx sends a strict Content-Security-Policy plus `X-Frame-Options`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`; Caddy adds HSTS. React escapes all rendered text, and the fonts are self-hosted.
- **Errors** use RFC 9457 problem details. `detail` is safe to show to shoppers, and validation errors add an `errors` map keyed by field.

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register · login · refresh · logout`, `GET/PATCH /api/auth/me`, `POST /api/auth/password/forgot · reset · change` |
| Catalog | `GET /api/products?q&category&tag&occasion&minPrice&maxPrice&sort&page&size`, `/api/products/{id}`, `/{id}/related`, `/categories` |
| Cart | `GET/DELETE /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/{id}`, `POST /api/cart/merge` |
| Wishlist | `GET /api/wishlist`, `PUT/DELETE /api/wishlist/{productId}`, `POST /api/wishlist/merge` |
| Checkout | `GET /api/checkout/options`, `POST /api/checkout/quote` |
| Orders | `POST /api/orders` (Idempotency-Key), `GET /api/orders`, `GET /api/orders/{n}`, `POST /api/orders/{n}/payment/verify`, `POST /api/orders/{n}/cancel`, `GET /api/orders/track?orderNumber&email` |
| AI | `POST /api/ai/recommendations`, `POST /api/ai/gift-message` |
| Admin | `/api/admin/products` (CRUD), `/api/admin/orders?status=CONFIRMED,PACKED` (list by one or more statuses, detail, `PATCH /{n}/status`), `/api/admin/coupons`, `GET /api/admin/stats`, `GET /api/admin/messages?handled`, `PATCH /api/admin/messages/{id}` |
| Other | `POST /api/contact`, `POST /api/newsletter/subscribe`, `POST /api/payments/razorpay/webhook` |

## Before you go live

- [ ] Strong, unique `JWT_SECRET`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` and `ADMIN_PASSWORD`.
- [ ] `DOMAIN` and `APP_PUBLIC_URL` set. Launch with the prod overlay (HTTPS).
- [ ] SMTP configured and a test password reset received.
- [ ] Razorpay live keys and webhook configured, and a test payment made with test keys first.
- [ ] Backups copied off the server, and a restore tried once.
- [ ] Product photos: the seed catalog uses external image URLs for demo purposes. Replace them with photos you own (Store admin → Products).
- [ ] Review the seeded coupons (`WELCOME`, `GIFT20`: one use per customer) in Store admin → Coupons.
- [ ] Put your real support email, phone, city and social links in `frontend/src/config/site.js`.
- [ ] Have the Privacy Policy and Terms pages (`frontend/src/pages/Info.jsx`) reviewed for your business. The text provided is a sensible starting point, not legal advice.
