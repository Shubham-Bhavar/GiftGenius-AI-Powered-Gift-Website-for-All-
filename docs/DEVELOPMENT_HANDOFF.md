# GiftGenius development handoff

State on 2026-10-28: all changes are in **one local commit** on the branch `audit/production-readiness`, created from `refactor/architecture` @ `5074d69`. Nothing was pushed, merged or deployed, and no hosted service or production database was touched.

## Files changed

### Backend

| File | Change | Why |
|---|---|---|
| `order/service/OrderService.java` | When opening the online payment fails, the cancelled attempt releases its Idempotency-Key before it is cancelled | GG-01: a retry with the same key (as the checkout page does after a 503) placed no order and showed the cancelled one |
| `pricing/service/PricingService.java` | Quote lines of the same product are merged before pricing and stock checks | GG-02: personalised lines of one product are priced and stock-checked together, like order placement |
| `catalog/service/ProductService.java` | `sortFor` ends every sort on the product id (and is package-visible for its test) | GG-06: stable paging when products tie on price, rating or creation time |
| `GiftGeniusApplication.java` | Excludes `UserDetailsServiceAutoConfiguration` | GG-07: no unused in-memory user, no generated password in the logs |
| Tests: `it/PaymentIT.java`, `it/CheckoutIT.java`, `it/CatalogIT.java`, `pricing/service/PricingServiceTest.java`, new `catalog/service/ProductSortTest.java`, new `it/SecurityStartupIT.java` | One regression test per fix | |

### Frontend

| File | Change | Why |
|---|---|---|
| `src/hooks/useCheckout.js` | The quote sends cart lines as they are (each ≤ 10) instead of capping each product's total at 10 | GG-02 |
| `src/pages/auth/Auth.jsx` | `safeNext` also rejects `\` and control characters | GG-03 |
| `src/pages/product/Product.jsx` | A 400 from the product lookup (non-numeric id) shows "We couldn't find that gift" | GG-04 |
| `src/services/api/client.js` | New exported `apiBase()`: accepts `VITE_API_BASE` with or without a trailing `/api` | GG-05 |
| `package-lock.json` | `npm audit fix` (no `--force`): vite 8.3.5, vitest 5.0.5, undici, zod, source-map-js | GG-08 |
| Tests: `src/test/checkout.test.jsx`, `src/test/api.test.js`, `src/test/mockApi.js` | New tests; the API mock now mirrors the real API (quote lines 1–10 merged per product; 400 for a non-numeric product id) | |

### Documentation

`README.md` (stale paths, API table, test counts) and the five new reports in `docs/`.

## Compatibility notes

- **No API contract change.** Request and response shapes are the same. `POST /api/checkout/quote` still accepts 1–10 units per line and now also accepts several lines for one product (they are merged); responses carry one line per product.
- **Idempotency.** A key now identifies the attempt that produced an order. A key whose attempt was cancelled because the payment couldn't be started may be reused, and only that case changed.
- **Ordering.** Shop results within equal prices, ratings or dates now come in id order (newest: id descending), so they no longer vary between requests.
- **No database migration.** The migrations are identical to `main`, so the code runs on a database migrated by `main`.
- **Spring Security.** Removing the default in-memory user changes nothing for sign-in, which is JWT only; HTTP Basic and form login were already disabled.
- **`VITE_API_BASE`.** Existing values keep working; a value ending in `/api` now also works.

## Run it locally

Prerequisites: JDK 21, Maven 3.9+, Node 22 (≥ 22.22.2 avoids jsdom engine warnings), MySQL 8 that you can create databases on.

1. **Database (isolated).** Create a dedicated database and user, e.g. with `scripts/mysql-local-setup.sql` (creates `giftgenius` and `giftgenius_test`). Never point the app or the tests at production: the integration tests **Flyway-clean** their database.
2. **Backend**
   ```bash
   cd backend
   export DB_URL='jdbc:mysql://localhost:3306/giftgenius?serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true'
   export DB_USERNAME=giftgenius DB_PASSWORD='<local password>' ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<12+ characters>'
   mvn spring-boot:run -Dspring-boot.run.profiles=dev
   ```
   The `dev` profile supplies a throw-away JWT secret and non-Secure cookies. Without `GEMINI_API_KEY` the AI answers from rules; without `RAZORPAY_*` checkout offers Cash on Delivery only; without `SMTP_HOST` emails are written to the log.
3. **Frontend**
   ```bash
   cd frontend
   npm ci
   npm run dev          # http://localhost:5173, proxies /api to localhost:8080 (override with API_PROXY_TARGET)
   ```
4. **Docker alternative:** `cp .env.example .env`, fill in the secrets, `docker compose up --build` → http://localhost:8081.

## Run the checks

```bash
cd frontend && npm run lint && npm test && npm run build
cd backend && mvn verify                                   # unit tests
cd backend && IT_DB_URL='jdbc:mysql://127.0.0.1:3306/giftgenius_test?serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true' \
  IT_DB_USERNAME=giftgenius IT_DB_PASSWORD='<test password>' mvn verify -Pintegration   # + integration tests (cleans that database)
```

Expected today: 140 frontend tests, 242 backend unit tests, 110 integration tests, all passing (see TEST_RESULTS.md).

## Branch and commit

The changes are one local commit on `audit/production-readiness`, on top of `5074d69` (itself one tests-only commit ahead of `origin/refactor/architecture`). Pushing the branch or opening a PR is a separate decision. To move the branch onto a `main` that already contains PR #2 (merged or squash-merged), fetch and run `git rebase --onto origin/main d80d4c0`, which replays only those two commits.

## Remaining tasks, in priority order

1. **Restore the data layer (infrastructure).** Decide where production runs, recover or restore the MySQL data from the offline Railway service or the latest backup into a new instance, and check it before any app connects. Keep the old volume untouched until the new copy is verified.
2. **Provision the backend host and its environment** (REPOSITORY_AUDIT.md §8), including the cross-site cookie and CORS settings if the frontend stays on Vercel, and a health check that matches the management port setup.
3. **Close GG-10 on that host:** see how `X-Forwarded-For` arrives, then set `SERVER_FORWARD_HEADERS_STRATEGY=native` if its proxy connects from a private address (verified locally to restore the limit under an appending proxy).
4. **Razorpay in test mode end to end** (keys, webhook URL and secret, one payment), then live keys only with explicit approval.
5. **Review and merge this branch** after reading BUG_REGISTER.md; then a deployment and live smoke test when approved.
6. **Vercel hardening:** add a Content-Security-Policy to `vercel.json`, tried on a preview first (GG-11); decide on public source maps (GG-12).
7. **Housekeeping:** align Node versions (GG-13), decide on rate-limiting the quote endpoint (GG-15), deal with the `.env` in the old project copy (GG-16), add a backend dependency scan (e.g. OWASP dependency-check or GitHub Dependabot) to CI.
8. **Optional:** wire the backend-only `/api/search` and `/api/ai/gift-request` into the storefront, and run a real-browser accessibility pass (contrast, screen reader).
