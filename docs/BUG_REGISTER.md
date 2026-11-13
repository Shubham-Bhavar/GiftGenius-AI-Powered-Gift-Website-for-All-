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
| GG-10 | Medium | Rate limiting | Per-IP limits trust a client-supplied `X-Forwarded-For` when the API is reached without the bundled nginx (e.g. Railway) | Fixed (2026-11-11), see GG-24 |
| GG-11 | Low | Vercel config | The Vercel deployment sends no Content-Security-Policy | Confirmed, not changed |
| GG-12 | Low | Frontend build | Production builds publish source maps | Confirmed, not changed |
| GG-13 | Low | Dev environment | `engines.node` (≥ 20.19) is lower than what the test tooling needs (jsdom 30: ≥ 22.22.2) | Fixed (2026-11-11): `^22.22.2 \|\| >=24.15.0` |
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

### GG-13 · Low · Node engine range

`package.json` declares `node >= 20.19`, but jsdom 30 (tests) requires `^22.22.2 || ^24.15.0 || >= 26`. On the local Node 22.19 npm prints `EBADENGINE` warnings, though all tests pass. CI uses the latest Node 22, which satisfies it. Recommend raising `engines` or pinning CI and local Node to ≥ 22.22.2.
- **Status:** Fixed on 2026-11-11: `engines` is now `^22.22.2 || >=24.15.0` (package.json and its lock file);
  Docker (`node:22-alpine`) and CI (`node-version: "22"`) take the newest Node 22 release.

## Open

### GG-10 · Medium · Rate limits trust a client-supplied `X-Forwarded-For` without the bundled nginx

- **Where:** `application.yml` (`server.forward-headers-strategy: framework`), `security/RateLimitFilter.java`.
- **Reproduction (local, API reached directly):** see TEST_RESULTS.md: 25 sign-in attempts from one machine, each with a different `X-Forwarded-For` value, are all processed, while the same attempts without the header are cut off at the per-minute limit (429).
- **Root cause:** Spring's `ForwardedHeaderFilter` takes the client address from the first `X-Forwarded-For` value, whoever sent it. The code comments rely on nginx overwriting the header, which is true for the Docker setup in this repository. The README's Vercel + Railway topology puts the API directly behind Railway's proxy, where a client can send its own header; if Railway appends to it instead of replacing it, the per-IP limits on sign-in (credential stuffing) and AI calls can be bypassed. AI cost stays capped by the daily model budget (`AI_DAILY_CALL_LIMIT`), and BCrypt (cost 12) slows guessing.
- **Recommended fix (owner decision, needs a Railway check):** on Railway set `SERVER_FORWARD_HEADERS_STRATEGY=native` (Tomcat's RemoteIpValve trusts the header only from private-range proxies and takes the right-most untrusted address), after confirming that Railway's proxy connects from a private address; otherwise every visitor would share one rate-limit bucket. No code change was made because the effect can't be verified without the hosted environment.
- **Status:** Fixed on 2026-11-11 by switching to `native` (GG-24). Still to confirm on the chosen host: that its proxy connects from a private address, or set `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` to match it.

### GG-11 · Low · No Content-Security-Policy on Vercel

`frontend/nginx.conf` sends a strict CSP; `frontend/vercel.json` sends only `nosniff`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. A CSP for Vercel must allow the Railway API origin, Razorpay's script and frames and the external product images, so it should be written and tried on a preview deployment first. Not changed (production hosting configuration).

### GG-12 · Low · Public source maps

`vite.config.js` has `build.sourcemap: true`, so 31 `.map` files are published with the site. They expose readable source and comments, not secrets (a secret scan of the bundle found none). Use `sourcemap: 'hidden'` if public maps aren't wanted. Owner decision; not changed.

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

## Found while building the Gift Studio (2026-10-30)

On branch `feat/gift-decision-assistant`; see [GIFT_STUDIO.md](GIFT_STUDIO.md). Defects in the studio's own new code, found and fixed before it was committed, are listed there.

### GG-20 · Low · Message helper link contrast on raised surfaces (dark theme)

- **Where:** `frontend/src/styles/pages.css`, `.pd-ai-link` ("✨ Help me write the message with GiftGenius AI"), used on product pages and in the Gift Studio's controls.
- **Found by:** axe-core's colour-contrast rule in a real browser with style transitions paused: 4.06:1 (`#b8791a` on the raised panel `#1e2a2d`) in the dark theme.
- **Fix:** the dark theme uses the light gold (`--gold-light`), as the other small gold text in the dark theme already does.
- **Verification:** 0 contrast violations on every Gift Studio view, in both themes.

## Checked and not defective

- Payment verification: HMAC with constant-time comparison, order ownership via a locked per-user lookup, amount and currency checked on webhooks, duplicate and out-of-order webhooks handled, client-sent amounts never trusted (server pricing only).
- Authorization: admin and seller routes reject other roles (403) and anonymous callers (401); another customer's order answers 404 (verified live). Forged or unsigned JWTs are rejected.
- Refresh cookie: httpOnly, scoped to `/api/auth`, `Secure` configurable, CSRF header required for refresh and logout.
- Secrets: none in the Git history (pattern scan) or in the built bundle; the Gemini key is server-side only and sent in a header; logs mask emails and reset tokens.
- AI: invalid quiz input is rejected (400), and without a key the API answers from rules and says so (`source: "rules"`, shown in the UI as "Matched from our curated catalog").
- Migrations: identical to `main`, so no checksum mismatch against an existing database.

## Found in the full-roadmap run (2026-11-10 to 2026-11-12)

On branch `feat/gift-decision-assistant`, uncommitted. Found by the PR #3 CI failure, a backend security audit, a
data-integrity audit and a frontend audit, each verified before fixing; GG-51 to GG-53 were found while preparing
the live demo (2026-11-13). Every fix has a regression test except GG-29, GG-30, GG-33, GG-44, GG-50 and GG-52
(each says why below).

Deliberate breaks (each fix undone on purpose, then the tests run; every file restored after its check): 38 run,
37 caught the first time. The one missed (the gift assistant shown on checkout, admin and Seller Center) now has a
test that catches it. The 38 include 9 for GG-28: each of its six catch sites, the two exception families it
passes on, and the order placed through the API.

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| GG-21 | Medium | Sign-in dialog | The dialog's delayed autofocus moved focus to Email while the shopper typed the password (CI failed on fast runners) | Fixed |
| GG-22 | High | Orders (admin) | An admin could cancel an order part of which a seller had already shipped: shipped units restocked, the whole order refunded | Fixed |
| GG-23 | Medium | Seller privacy | A pending, suspended or rejected store could still read customers' names, phones and addresses on its orders | Fixed |
| GG-24 | High | Rate limiting | Limits could be dodged with a `Forwarded` or `X-Forwarded-Prefix` header or a percent-encoded path, even behind nginx | Fixed |
| GG-25 | Medium | Rate limiting | The limiter's memory wasn't bounded within one minute | Fixed |
| GG-26 | Low | Logging | A broken unique key logged the offending value (an email) | Fixed |
| GG-27 | Low | Validation | Size limits missing on the wishlist merge, sign-in email, current password, delivery email and admin product fields | Fixed |
| GG-28 | Medium (latent) | Email outbox | A deadlock while queueing an email was swallowed, though MySQL had rolled back the whole order transaction | Fixed (2026-11-13; the first fix, 2026-11-11, didn't take effect) |
| GG-29 | Low | Checkout | Two checkouts could deadlock on product rows (stock locked in cart order) | Fixed |
| GG-30 | Low | Coupons | A coupon checkout locked every coupon row until commit (`upper(code)` defeated the unique index) | Fixed |
| GG-31 | Low | Newsletter | Two sign-ups of one email at the same moment answered 409 | Fixed |
| GG-32 | Low | Orders | Cancelling an order paid in full by a coupon (₹0) queued a ₹0 refund and promised one | Fixed |
| GG-33 | Low | Email reconciliation | The 5-minute reconciliation scanned all order events (no index for it) | Fixed (V9 index) |
| GG-34 | Medium | AI assistant | Text the model writes could claim a price, discount or stock level | Fixed in the new assistant |
| GG-35 | Medium | Orders | Unlimited cash-on-delivery orders: confirmation emails to any address, stock held | Partly fixed: `POST /api/orders` is now rate-limited per client; a per-customer cap is an owner decision |
| GG-36 | Medium | Catalogue | Saving a product form overwrites stock with the form's value (lost update if orders reserved stock meanwhile) | Open: needs the product API to carry a version (API change) |
| GG-37 | Low | Auth | Access tokens can't be revoked before they expire (15 min); seller application returns a new session from an access token | Open, owner decision |
| GG-38 | Low | Auth | A rotated refresh token can be exchanged again any number of times within its 30-second grace | Open: tightening it signs out a third tab refreshing at once |
| GG-39 | Low | Auth | Registration answers 409 for a registered email (enumeration); no email verification | Open, product decision |
| GG-40 | Low | Order tracking | The tracking lookup sends the order number and email in the query string (logs, history) | Open: API change |
| GG-41 | High | Cart and wishlist | A saved guest cart or wishlist in an unexpected shape (an older version, another tab, a hand edit) blanked the whole site | Fixed |
| GG-42 | Medium | Session | A server error or network blip while restoring the session showed a signed-in shopper as signed out, with no retry | Fixed |
| GG-43 | Medium | Checkout | A failed price quote showed no error and no way to retry | Fixed |
| GG-44 | Medium (suspected) | Cart and wishlist | A cart read in flight during the sign-in merge could land after it and show the pre-merge cart | Fixed defensively; a race, no deterministic test |
| GG-45 | Medium (suspected) | Cart and wishlist | The sign-in merge isn't exactly-once: a retry after a lost response could add the guest lines twice | Open: needs an idempotency key on the merge (API change) |
| GG-46 | Low | Gift assistant | "Start over" while a reply was on its way let that reply land in the new conversation, and left the panel busy | Fixed |
| GG-47 | Low | Cart | Quick quantity clicks for a signed-in shopper could overwrite each other | Fixed |
| GG-48 | Low | Checkout | While a changed delivery option was being priced, the Pay button showed and accepted the previous total | Fixed |
| GG-49 | Low | Payment | A failed load of the Razorpay script was cached until the page was reloaded | Fixed |
| GG-50 | Low | Layout | Search-box and link-scroll timers ran after the page changed; Enter on any control skipped the entry | Fixed; no dedicated test (timers) |
| GG-51 | Low | Gift assistant | With nothing to go on, the assistant showed its question twice (the reply and the question are the same text) | Fixed (found in the 2026-11-13 demo run) |
| GG-52 | Medium | Gift assistant | The sticky header covered the top of the assistant panel on phones and on short desktop windows | Fixed (found in the 2026-11-13 demo run) |
| GG-53 | Low | Order confirmation | The confirmation page says "We've emailed a confirmation" even when no email provider is configured and nothing was sent | Open: the page can't tell; needs the API to say whether the email was queued for sending |
| GG-54 | Low | Tests | A gift assistant test raced a sign-in redirect: it failed on CI's fast runners and checked nothing locally | Fixed (test removed; the behaviour is covered by a reliable test) |

### Details of the fixed items

- **GG-21:** `AuthModal.jsx` moves focus to the first field 100 ms after the dialog opens or changes mode, unless focus is
  already in one of the dialog's fields. Reproduced by scaling the timer to this machine's speed (the original tests then
  failed exactly as on CI). Tests: `auth.test.jsx` "sign-in dialog first-field focus" (4); each fails without the guard.
- **GG-22:** `OrderService.adminUpdateStatus` refuses CANCELLED (409) when any line has shipped, as the customer's cancel
  already did. Test: `SellerMarketplaceIT.anAdminCantCancelAnOrderPartOfWhichHasShipped`.
- **GG-23:** `SellerOrderService.get` returns the delivery details only to an approved store; the Seller Center page
  says why they're missing. Tests: `SellerMarketplaceIT.aSuspendedStoreCantUpdateOrdersOrSeeTheCustomersDeliveryDetails`,
  `seller.test.jsx`.
- **GG-24 (and GG-10):** `server.forward-headers-strategy: native`: Tomcat takes the client address from
  `X-Forwarded-For` only when the request comes from a trusted proxy (private and loopback ranges), right-most untrusted
  address first, and ignores `Forwarded` and `X-Forwarded-Prefix`; the limiter classifies the decoded path; nginx no
  longer passes `Forwarded`, `X-Forwarded-Host`, `X-Forwarded-Port` or `X-Forwarded-Prefix`. Tests over real HTTP through
  Tomcat: `RateLimitClientAddressIT` (direct, every trick refused), `RateLimitBehindProxyIT` (appending proxy);
  `RateLimitFilterTest` (encoded paths). On a host whose proxy connects from a public address, set
  `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` to match it, or every visitor shares one limit.
- **GG-25:** once 100,000 windows are tracked in a minute, new clients share one overflow window per bucket.
  Test: `RateLimitFilterTest.aFloodOfNewClientsSharesOneOverflowWindowInsteadOfGrowingMemory`.
- **GG-26:** `GlobalExceptionHandler` logs the rule's name (`users.uk_users_email`), never the value.
  Test: `GlobalExceptionHandlerLogTest`.
- **GG-27:** `@Valid` on the wishlist merge; `@Size` limits; admin products: long description ≤ 10,000, at most
  30 tags and 20 of each other list, each within its column. Test: `RequestLimitsIT`.
- **GG-28:** order emails are queued inside the order's transaction (`EmailOutbox.enqueue`, plain JDBC, no
  transaction of its own). On a deadlock MySQL rolls back that whole transaction, order included.
  - First fix (2026-11-11): `enqueue` passes a `PessimisticLockingFailureException` on instead of swallowing it.
    It didn't take effect: every caller in `OrderNotifier` (`customer`, `sellers`, `owner`, `partialShipment`)
    caught `RuntimeException` around it and logged it as a content failure, so the request carried on as if the
    order had been saved. Found in the pre-commit review of 2026-11-13.
  - Fix (2026-11-13): `OrderNotifier.isTransactionFailure` tells a failure of the transaction (Spring's
    `DataAccessException` and `TransactionException`, and JPA's `PersistenceException`, which Hibernate's lock
    and lazy-load errors extend) from a content failure. All six catch sites in `OrderNotifier` pass the first
    on and still skip and count the second. The request fails with a retryable 409 (`GlobalExceptionHandler`).
    A statement-level database error inside `enqueue` is still "not queued" (`enqueue` returns false) and never
    fails the order; nor does sending, which happens after commit. No new transaction was introduced.
  - Tests: `OrderNotifierTest` (7 new: a deadlock from each of the four paths is passed on and stops further
    emails; JPA and transaction failures while an email is built; the classification; a "not queued" answer
    still fails nothing) and `OrderEmailDeadlockIT` (through the API: 409, no order, no stock held, no email
    queued, the cart unchanged; the retry places the order). The deadlock is simulated with the exception Spring
    makes of MySQL error 1213; no lock cycle that causes one in this code is known.
- **GG-29:** stock is reserved and released in product id order. No test: a deadlock between two checkouts can't be
  produced on demand; the existing parallel checkout tests pass.
- **GG-30:** `CouponRepository.consume/release` match `c.code = :code` (codes are stored upper case; the collation is
  case-insensitive), so one row is locked. The existing coupon tests (`CheckoutIT`, codes typed in lower case
  included) pass; the narrower lock itself isn't asserted.
- **GG-31:** `NewsletterService.subscribe` takes a unique-key clash as "already subscribed".
  Test: `NewsletterConcurrencyIT` (6 at once, 3 rounds: all 200, one row).
- **GG-32:** a cancelled order goes to REFUND_PENDING only when its total is above zero. Test: `FreeOrderCancelIT`.
- **GG-33:** `V9__order_events_status_index.sql` adds `(status, created_at)` on `order_status_events`. Every
  integration run applies it and validates the schema; the query plan wasn't measured on production-sized data.
- **GG-34:** `GiftAssistantService` replaces model-written replies or reasons that mention prices, discounts, offers,
  stock or delivery terms; the catalogue's real price and stock are shown beside each gift. Tests:
  `GiftAssistantServiceTest`, `GiftAssistantIT.aModelsPriceOrDiscountClaimNeverReachesTheShopper`.
- **GG-41:** `readGuestCart` and `readGuestWishlist` read the saved value through a sanitiser: anything that isn't a
  list becomes empty, malformed lines are dropped, quantities are clamped to 1-10, keys rebuilt and duplicates merged.
  The storage keys and the format written are unchanged. Tests: `resilience.test.jsx` (unit checks, and the site
  rendering with three bad saved values).
- **GG-42:** `AuthContext` retries a session restore twice (1 s, then 2 s) while the session hint is still there, which
  only a transient failure leaves; afterwards it retries when the tab regains focus or the network returns. A real
  401 still signs out at once. Tests: `resilience.test.jsx` (503 then success; 401).
- **GG-43:** Checkout shows the quote's error with *Try again*. Test: `resilience.test.jsx`.
- **GG-44:** the cart and wishlist merges cancel any read in flight before writing the merged result. A race between
  two requests; no test reproduces it reliably.
- **GG-46:** each conversation has a number; a reply for an earlier one is dropped. Test: `resilience.test.jsx`.
- **GG-47:** a signed-in shopper's line waits for its change to reach the server before taking the next (its controls
  are disabled meanwhile). Test: `resilience.test.jsx` (two clicks: quantity 3 on the server).
- **GG-48:** the button reads *Updating the total…* and is disabled while the quote for a changed option loads.
  Test: `resilience.test.jsx`.
- **GG-49:** a load that brings no `Razorpay` clears the cached attempt, as a load error already did. Test:
  `resilience.test.jsx`.
- **GG-50:** the search box's blur timer is cleared on focus, the link-scroll timer is cleared when the page changes,
  and the entry only skips on Enter pressed inside it. Cosmetic timers; no dedicated test.
- **GG-51:** the panel shows the follow-up question only when it differs from the reply. The API is unchanged.
  Test: `assistant.test.jsx` (the question appears exactly once; fails without the fix).
- **GG-52:** the panel's height is capped so it ends below the header (desktop `100vh - 200px`, phones
  `100vh - 224px`), keeping the header's account and cart buttons usable, and `.ga-panel` is at z-index 210
  (above the header and mobile nav, below the cart drawer, quick view, toasts and sign-in dialogs) so it is never
  hidden if they still meet. Checked in the browser at 1024x768 and 375x812, at the top of the page and scrolled;
  the cart drawer still covers the panel. No automated test: the tests don't load CSS.
- **GG-54:** `assistant.test.jsx` "stays out of the way on %s" rendered checkout, admin and Seller Center signed
  out, waited 50 ms and expected no assistant; signed-out visitors are redirected to `/login`, where it shows. It
  failed on CI (PR #3 run 43404039472) and passed locally only because nothing had rendered yet. Removed; covered
  by "stays out of the way while paying and in the back offices", which signs in and waits for each page.
