# GiftGenius bug register

Audit date: 2026-10-28, branch `audit/production-readiness` (from `refactor/architecture` @ `5074d69`). Statuses: **Fixed** (changed and verified by a test that failed before the fix, or by the stated check), **Confirmed** (reproduced or certain from the code, not changed), **Suspected** (plausible, needs verification), **Blocked** (needs access this audit didn't have).

Severity: Critical (data loss, money or account compromise), High (core journey broken or wrong money outcome), Medium (wrong result or real security weakness with limits), Low (edge case, hardening, hygiene).

## Summary

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| GG-01 | High | Orders / checkout | Retrying checkout after a Razorpay outage returns the cancelled order | Fixed |
| GG-02 | Medium | Cart / pricing | Price preview understates the charged total for personalised lines of one product | Fixed |
| GG-08 | Medium | Frontend tooling | 6 npm advisories (4 high) in development dependencies | Fixed |
| GG-03 | Low | Auth (frontend) | Sign-in redirect filter accepts `/\host` and control characters | Fixed |
| GG-04 | Low | Product page | A malformed product link shows a retryable error instead of "not found" | Fixed |
| GG-05 | Low | API client | `VITE_API_BASE` ending in `/api` sends every call to `/api/api/…` (404) | Fixed |
| GG-06 | Low | Catalogue | Shop sorts have no unique tie-breaker, so pages can repeat or skip products | Fixed |
| GG-07 | Low | Backend startup | A generated in-memory password is written to the log at every start | Fixed |
| GG-09 | Low | Documentation | README points to files that no longer exist and omits two endpoints | Fixed |
| GG-10 | Medium | Rate limiting | Per-IP limits trust a client-supplied `X-Forwarded-For` when the API is reached without the bundled nginx (e.g. Railway) | Confirmed (locally); production impact Blocked |
| GG-11 | Low | Vercel config | The Vercel deployment sends no Content-Security-Policy | Confirmed, not changed |
| GG-12 | Low | Frontend build | Production builds publish source maps | Confirmed, not changed |
| GG-13 | Low | Dev environment | `engines.node` (≥ 20.19) is lower than what the test tooling needs (jsdom 30: ≥ 22.22.2) | Confirmed, not changed |
| GG-14 | Info | API | Unknown `/api` paths answer 401 (not 404) to anonymous callers | By design, documented |
| GG-15 | Low | API abuse | `POST /api/checkout/quote` is public and not rate-limited | Suspected risk |
| GG-16 | Low | Workstation | Older project copies outside the repository include a `.env` file | Confirmed, not changed |
| GG-17 | Medium | AI gift request | "She hates perfume" was read as an interest in perfume | Fixed (2026-10-29) |
| GG-18 | Low | Quiz page | An empty "Your Gift Matches" heading showed under the questions | Fixed (2026-10-29) |
| GG-19 | Low | Quiz page styles | Card category and reason (light) and teal buttons (dark) were below 4.5:1 contrast | Fixed (2026-10-29) |

## Fixed

### GG-01 · High · Retrying checkout after a Razorpay outage returns the cancelled order

- **Where:** `backend/.../order/service/OrderService.java` (`place`), with `frontend/src/pages/checkout/Checkout.jsx` keeping the Idempotency-Key after a 5xx.
- **Reproduction:** cart with an item → `POST /api/orders` (ONLINE, `Idempotency-Key: K`) while Razorpay is down → 503, the attempt is cancelled and stock released → retry `POST /api/orders` with the same key (Razorpay back up, or COD as the error message suggests) → **201 with the cancelled order** (`GG-AYHBRU2N`, status CANCELLED, payment FAILED). The shopper lands on a cancelled order and no order is placed. Reproduced by the new integration test before the fix.
- **Root cause:** the cancelled attempt kept its Idempotency-Key, so every retry with that key was answered with it. The frontend correctly keeps the key after a 5xx, because a network-level failure may hide a created order.
- **Fix:** when opening the payment fails, the cancelled attempt gives its key back (`idempotencyKey = null`) before it is cancelled. A retry with the same key places a new order; a double-click on that retry still returns the one new order. No schema change; the unique `(user_id, idempotency_key)` constraint allows several NULLs.
- **Verification:** `PaymentIT.retryAfterARazorpayOutageWithTheSameKeyPlacesANewOrder` (new; failed before, passes after). The existing outage test still passes.

### GG-02 · Medium · Price preview understates the charged total for personalised lines of one product

- **Where:** `frontend/src/hooks/useCheckout.js` (`useQuote`), `backend/.../pricing/service/PricingService.java`.
- **Reproduction:** add one product twice with different custom names (10 × "Asha", 5 × "Ravi"; each line may hold up to 10). The cart and checkout summary price only 10 units, because the preview summed the lines per product and then capped the sum at 10 (the API accepts at most 10 per quote line). Placing the order charges all 15 units. Example in the new frontend test: ₹4,990 shown for ₹7,485 charged. On the API side, duplicate lines were also stock-checked one by one, so lines that together exceeded the stock passed the preview and failed only at "Place order".
- **Fix:** the preview sends the cart lines as they are (each ≤ 10, as the cart already enforces), and the server merges lines of the same product before pricing and checking stock, exactly as order placement does. The API contract is unchanged (merged lines are still accepted; quote lines still allow 1–10).
- **Verification:** `checkout.test.jsx` "prices personalised lines of one product at their full quantity…" (failed before), `PricingServiceTest.personalisedLinesOfOneProductArePricedAndStockCheckedTogether`, `CheckoutIT.quotePricesPersonalisedLinesOfOneProductTogether` (failed before). End to end on the local stack: cart showed ₹5,235 (15 × ₹349) and order `GG-PTGRH2AK` was charged ₹5,235.

### GG-08 · Medium · 6 npm advisories in development dependencies

- **Where:** `frontend/package-lock.json`.
- **Reproduction:** `npm audit` → 6 vulnerabilities (4 high, 2 moderate) in vite 8.3.1 (dev-server file exposure, cross-origin script execution, launch-editor command injection on Windows), vitest/@vitest/mocker, undici, zod, source-map-js. `npm audit --omit=dev` → 0: nothing ships to browsers, but the dev server and test runner are exposed on developer machines.
- **Fix:** `npm audit fix` without `--force`: lockfile only, within the ranges already declared (vite 8.3.5, vitest 5.0.5, undici 8.12.3, zod 4.6.7, source-map-js 1.2.2). `package.json` unchanged.
- **Verification:** `npm audit` → 0 vulnerabilities; lint, 140 tests and the production build pass on the new lockfile.

### GG-03 · Low · Sign-in redirect filter accepts `/\host` and control characters

- **Where:** `frontend/src/pages/auth/Auth.jsx` (`safeNext`).
- **Reproduction:** `/login?next=%2F%5Cevil.example` passes the filter (it starts with `/` and not `//`). Browsers read `\` as `/`: in Chromium `new URL('/\\evil.example', location.href)` is `http://evil.example/`. The app navigates there with `replace`, which Chromium refuses (`SecurityError` from `history.replaceState`), so no redirect happened in the check, but the sign-in flow then breaks; with a `push` navigation React Router falls back to `location.assign`, which would leave the site. Tabs and line breaks (`/%09/evil.example`) behave the same way.
- **Fix:** also reject `\` and control characters.
- **Verification:** `checkout.test.jsx` "accepts only same-site paths…" (new). The existing `//evil.example` test still passes.

### GG-04 · Low · A malformed product link shows a retryable error

- **Where:** `frontend/src/pages/product/Product.jsx`.
- **Reproduction:** open `/product/abc`. The API answers 400 (`Failed to convert 'id'…`), and the page showed the generic error with "↻ Try again", which can never succeed.
- **Fix:** treat 400 like 404 there ("We couldn't find that gift").
- **Verification:** `checkout.test.jsx` "treats a malformed gift link as not found…" (new; the API mock now answers 400 like the real API). Checked in the browser against the real backend.

### GG-05 · Low · `VITE_API_BASE` ending in `/api` doubles the prefix

- **Where:** `frontend/src/services/api/client.js`.
- **Reproduction:** the client appended `/api` to `VITE_API_BASE`, so the natural value `https://<api-host>/api` produced `https://<api-host>/api/api/products` for every call: a 404 everywhere. This is a plausible cause of the historical 404s on the Vercel site; the actual Vercel value couldn't be checked.
- **Fix:** `apiBase()` trims whitespace and trailing slashes and accepts the origin with or without `/api`.
- **Verification:** `api.test.js` "builds the API root from VITE_API_BASE without doubling /api" (new).

### GG-06 · Low · Shop sorts without a unique tie-breaker

- **Where:** `backend/.../catalog/service/ProductService.java` (`sortFor`).
- **Reproduction:** by code inspection. `price_asc`, `price_desc`, `rating` and `newest` sorted on non-unique columns only (all 20 seeded products share one `created_at`). SQL leaves the order of ties undefined, so paging with LIMIT/OFFSET can repeat or skip products. The new paging test passed on MySQL 8.0.43 with the seed data even before the fix, so this was not reproduced here.
- **Fix:** every sort ends on the product id.
- **Verification:** `ProductSortTest` (new unit test), `CatalogIT.everySortPagesThroughEachProductExactlyOnce` (new guard).

### GG-07 · Low · Generated in-memory password written to the log at every start

- **Where:** `backend/.../GiftGeniusApplication.java`.
- **Reproduction:** start the API: the log shows `Using generated security password: <uuid>` from Spring Boot's `UserDetailsServiceAutoConfiguration`. HTTP Basic and form login are disabled, so the account was not usable, but a credential-like value reached production logs at every deploy.
- **Fix:** exclude `UserDetailsServiceAutoConfiguration` (sign-in is JWT only).
- **Verification:** `SecurityStartupIT.noDefaultInMemoryUserIsCreated` (new) and a restart of the jar with the line absent (TEST_RESULTS.md).

### GG-09 · Low · README out of date

- **Where:** `README.md`.
- **Issue:** referenced `frontend/src/styles/giftgenius.css`, `frontend/src/config/site.js` and `frontend/src/pages/Info.jsx` (moved by the refactor), omitted `/api/search` and `/api/ai/gift-request`, and quoted old test counts (49 / 71 / 129).
- **Fix:** paths, API table and test counts corrected.

## Open

### GG-10 · Medium · Rate limits trust a client-supplied `X-Forwarded-For` without the bundled nginx

- **Where:** `application.yml` (`server.forward-headers-strategy: framework`), `security/RateLimitFilter.java`.
- **Reproduction (local, API reached directly):** see TEST_RESULTS.md: 25 sign-in attempts from one machine, each with a different `X-Forwarded-For` value, are all processed, while the same attempts without the header are cut off at the per-minute limit (429).
- **Root cause:** Spring's `ForwardedHeaderFilter` takes the client address from the first `X-Forwarded-For` value, whoever sent it. The code comments rely on nginx overwriting the header, which is true for the Docker setup in this repository. The README's Vercel + Railway topology puts the API directly behind Railway's proxy, where a client can send its own header; if Railway appends to it instead of replacing it, the per-IP limits on sign-in (credential stuffing) and AI calls can be bypassed. AI cost stays capped by the daily model budget (`AI_DAILY_CALL_LIMIT`), and BCrypt (cost 12) slows guessing.
- **Recommended fix (owner decision, needs a Railway check):** on Railway set `SERVER_FORWARD_HEADERS_STRATEGY=native` (Tomcat's RemoteIpValve trusts the header only from private-range proxies and takes the right-most untrusted address), after confirming that Railway's proxy connects from a private address; otherwise every visitor would share one rate-limit bucket. No code change was made because the effect can't be verified without the hosted environment.
- **Status:** Confirmed locally; production impact Blocked.

### GG-11 · Low · No Content-Security-Policy on Vercel

`frontend/nginx.conf` sends a strict CSP; `frontend/vercel.json` sends only `nosniff`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. A CSP for Vercel must allow the Railway API origin, Razorpay's script and frames and the external product images, so it should be written and tried on a preview deployment first. Not changed (production hosting configuration).

### GG-12 · Low · Public source maps

`vite.config.js` has `build.sourcemap: true`, so 31 `.map` files are published with the site. They expose readable source and comments, not secrets (a secret scan of the bundle found none). Use `sourcemap: 'hidden'` if public maps aren't wanted. Owner decision; not changed.

### GG-13 · Low · Node engine range

`package.json` declares `node >= 20.19`, but jsdom 30 (tests) requires `^22.22.2 || ^24.15.0 || >= 26`. On the local Node 22.19 npm prints `EBADENGINE` warnings, though all tests pass. CI uses the latest Node 22, which satisfies it. Recommend raising `engines` or pinning CI and local Node to ≥ 22.22.2.

### GG-14 · Info · Unknown API paths answer 401 to anonymous callers

`anyRequest().authenticated()` runs before routing, so `/api/does-not-exist` answers 401 to anonymous callers and 404 to signed-in ones. This is common for Spring Security and keeps the API surface private, but it can make a missing endpoint look like an auth problem when debugging. Documented, not changed.

### GG-15 · Low · Quote endpoint not rate-limited

`POST /api/checkout/quote` is public and does database work per call (up to 50 lines). The storefront calls it on every cart change, so a per-IP limit would need a generous budget. Suspected abuse risk; consider adding it to the PUBLIC bucket with its own limit after measuring normal traffic.

### GG-16 · Low · `.env` file in an old project copy

`C:\Users\Admin\Desktop\gifgenius\giftgenius\giftgenius\.env` (an untracked copy from 2026-09-26, outside the repository). It wasn't opened. If it holds real credentials, delete the copy or move the values to a password manager, and rotate anything that may have been shared.

## Found while building the gift decision assistant (2026-10-29)

On branch `feat/gift-decision-assistant`; see [GIFT_DECISION_ASSISTANT.md](GIFT_DECISION_ASSISTANT.md).

### GG-17 · Medium · Dislikes read as interests

- **Where:** `recommendation/engine/TextPreferenceParser.java`, used by `POST /api/ai/gift-request`.
- **Reproduction:** "A birthday gift for my wife under ₹1,500, she hates perfume" was understood as interests `["fragrance"]`, so perfume was ranked up: the opposite of what was asked.
- **Fix:** negation (English cues before the thing; nahi/नाही/नको/नहीं after it) puts the thing on an avoid list, which is a hard filter. The quiz notes are read the same way.
- **Verification:** `TextPreferenceParserTest` (17 new cases), `GiftRequestServiceTest.somethingTheyHateIsAvoidedNotRecommended`, `AiIT.aGiftRequestSayingWhatTheyHateAvoidsIt`.

### GG-18 · Low · Empty results heading during the quiz

- **Where:** `frontend/src/pages/ai/GiftFinder.jsx`.
- **Cause:** the results block was shown when `phase !== 'quiz'`, a phase that never exists, so the block rendered while the questions were on screen.
- **Fix:** shown only when the phase isn't `'form'`.
- **Verification:** `features.test.jsx` (no "Your Gift Matches" heading before results); checked in the browser.

### GG-19 · Low · Quiz results contrast

- **Where:** `frontend/src/styles/pages.css`.
- **Found by:** axe-core's colour-contrast rule run in a real browser on the quiz results (with style transitions paused so colours are final).
  - Light theme: `.rpc-cat` 3.77:1 and `.rpc-reason` 3.49:1.
  - Dark theme: cream text on the teal "Add to Cart" and "Browse All Gifts" buttons, 3.42:1.
- **Fix:** the light-theme text joins the existing deeper-teal list; the dark-theme buttons use the deeper teal (5.2:1), and their gold hover is unchanged.
- **Verification:** 0 contrast violations in the results section in both themes.

## Checked and not defective

- Payment verification: HMAC with constant-time comparison, order ownership via a locked per-user lookup, amount and currency checked on webhooks, duplicate and out-of-order webhooks handled, client-sent amounts never trusted (server pricing only).
- Authorization: admin and seller routes reject other roles (403) and anonymous callers (401); another customer's order answers 404 (verified live). Forged or unsigned JWTs are rejected.
- Refresh cookie: httpOnly, scoped to `/api/auth`, `Secure` configurable, CSRF header required for refresh and logout.
- Secrets: none in the Git history (pattern scan) or in the built bundle; the Gemini key is server-side only and sent in a header; logs mask emails and reset tokens.
- AI: invalid quiz input is rejected (400), and without a key the API answers from rules and says so (`source: "rules"`, shown in the UI as "Matched from our curated catalog").
- Migrations: identical to `main`, so no checksum mismatch against an existing database.
