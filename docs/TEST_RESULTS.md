# GiftGenius test results

Run on 2026-10-28 on Windows 11 with JDK 21.0.8, Maven 3.9.11, Node 22.19.0 and npm 10.9.3, on branch `audit/production-readiness` (base `5074d69`). Commands are the repository's own scripts and Maven configuration (`frontend/package.json`, `backend/pom.xml`, `.github/workflows/ci.yml`).

**Isolated database.** Integration tests run against a throw-away MySQL 8.0.43 server started for this audit from a fresh data directory in a temporary folder, bound to `127.0.0.1:3307`, with databases `giftgenius_test` (tests; Flyway-cleaned by every run) and `giftgenius_dev` (local app run). No other database was used; the machine's own MySQL service on port 3306 was not touched.

## Summary

| Check | Baseline (before fixes) | Final (after fixes) |
|---|---|---|
| Frontend lint (`npm run lint`) | PASS (exit 0) | PASS (exit 0) |
| Frontend tests (`npx vitest run`) | PASS: 9 files, 136 tests | PASS: 9 files, **140** tests (4 new) |
| Frontend production build (`npm run build`) | PASS (exit 0) | PASS (exit 0) |
| `npm audit` | FAIL: 6 advisories (4 high, 2 moderate), all dev-only; `--omit=dev`: 0 | PASS: 0 |
| Backend unit tests (`mvn verify`, surefire) | PASS: 239 | PASS: **242** (3 new) |
| Backend integration tests (`-Pintegration`, failsafe, real MySQL) | PASS: 106 | PASS: **110** (4 new) |
| Docker Compose config (base and prod overlay) | not run | PASS (`docker compose config --quiet`, exit 0) |
| Docker image builds | BLOCKED: Docker daemon not running | BLOCKED |
| Local end-to-end journeys (real backend, browser + HTTP) | not run | PASS for everything listed below; external services BLOCKED |

No test was skipped, disabled or weakened. Failures, errors and skips are 0 in every final run.

## Commands and results

### Frontend

```bash
cd frontend
npm ci --no-audit --no-fund      # exit 0
npm run lint                      # exit 0
npx vitest run                    # baseline: 136 passed; final: 140 passed (9 files, ~98 s)
npm run build                     # exit 0 (vite 8; emits 31 source maps, see GG-12)
npm audit                         # baseline: 6 vulnerabilities; after `npm audit fix`: 0
npm audit --omit=dev              # 0 (no runtime dependency affected)
```

`npm audit fix` printed `EBADENGINE` warnings: jsdom 30 asks for Node ≥ 22.22.2 and this machine has 22.19.0 (BUG_REGISTER GG-13). The tests pass regardless.

A secret scan of the built bundle (`dist/assets/*.js`) for Gemini keys, Razorpay keys and secret variable names found nothing; a pattern scan of every commit in the Git history found nothing either.

### Backend

```bash
cd backend
export IT_DB_URL='jdbc:mysql://127.0.0.1:3307/giftgenius_test?serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true&useSSL=false'
export IT_DB_USERNAME=giftgenius IT_DB_PASSWORD=<scratch value>
mvn -B verify -Pintegration
```

| Run | Unit (surefire) | Integration (failsafe) | Result | Time |
|---|---|---|---|---|
| Baseline | 239 passed | 106 passed | BUILD SUCCESS, exit 0 | 3 min 01 s |
| After the first fixes | 242 passed | 109 passed | BUILD SUCCESS, exit 0 | 3 min 52 s |
| Final (with GG-07) | 242 passed | 110 passed | BUILD SUCCESS, exit 0 | 3 min 47 s |

Integration tests per class (final): AdminBootstrapIT 5, AiIT 12, AnalyticsIT 2, AuthFlowIT 10, CatalogIT 6, CheckoutIT 10, ContactIT 4, CrossOriginIT 17, LocationIT 4, PaymentIT 9, SearchIT 5, SecurityStartupIT 1, SellerMarketplaceIT 25. Razorpay and Nominatim are local fake HTTP servers, and the AI provider and mailer are mocks, so no paid service or credential is needed.

### Regression tests for the fixes (reproduce first, then fix)

| Defect | Test | Before the fix | After |
|---|---|---|---|
| GG-01 | `PaymentIT.retryAfterARazorpayOutageWithTheSameKeyPlacesANewOrder` | FAIL: the retry returned cancelled order `GG-AYHBRU2N` | PASS |
| GG-02 | `CheckoutIT.quotePricesPersonalisedLinesOfOneProductTogether` | FAIL: "Expected size: 1 but was: 2" (lines not merged) | PASS |
| GG-02 | `checkout.test.jsx` "prices personalised lines of one product at their full quantity…" | FAIL: ₹7,485 not shown (10 units priced) | PASS |
| GG-02 | `PricingServiceTest.personalisedLinesOfOneProductArePricedAndStockCheckedTogether` | written with the fix | PASS |
| GG-03 | `checkout.test.jsx` "accepts only same-site paths as the page to return to" | written with the fix | PASS |
| GG-04 | `checkout.test.jsx` "treats a malformed gift link as not found…" | written with the fix | PASS |
| GG-05 | `api.test.js` "builds the API root from VITE_API_BASE without doubling /api" | written with the fix | PASS |
| GG-06 | `CatalogIT.everySortPagesThroughEachProductExactlyOnce` | PASS (ties were stable on this MySQL; not reproduced) | PASS |
| GG-06 | `ProductSortTest` (2 tests) | written with the fix | PASS |
| GG-07 | `SecurityStartupIT.noDefaultInMemoryUserIsCreated` | written with the fix | PASS |

The new frontend test for GG-02 and the two integration tests for GG-01 and GG-02 were run against the unfixed code first and failed as shown.

## Local end-to-end checks

Stack: backend jar on `localhost:8091` (management port 9191) against `giftgenius_dev`, Razorpay off, no Gemini key, geolocation off, SMTP off; Vite dev server on `localhost:5174` proxying `/api`. A local admin and test shoppers were created with generated values kept in a temporary file (not in the repository).

| Journey | Result | How |
|---|---|---|
| Fresh database migrates (V1–V6) and the app starts | PASS | log: "Successfully applied 6 migrations", started in 30 s |
| Restart on the migrated database | PASS | "Successfully validated 6 migrations… No migration necessary" |
| Missing `JWT_SECRET` | PASS: fails fast, exit 1, message "JWT_SECRET must be set to at least 32 bytes" | jar run |
| Unreachable database | PASS: fails, exit 1 after 16 s, "Communications link failure"; no secrets in the log | jar run |
| No generated password in the startup log (GG-07) | PASS after the fix (it was present before) | log grep |
| Home page, trending products | PASS, no console errors | browser |
| Categories, search, occasion and category filters, price filter with sort, related products, page-size clamp | PASS | HTTP |
| Product page; `/product/abc` shows "We couldn't find that gift"; unknown route shows the 404 page | PASS | browser |
| Guest cart with two personalised lines (10 + 5) priced at 15 units: ₹5,235 | PASS (GG-02 fix) | browser |
| Register, guest cart merged exactly once, checkout, COD order `GG-PTGRH2AK` charged ₹5,235 | PASS | browser |
| Session survives full page reloads (refresh cookie) | PASS | browser (2 refresh calls, 200) |
| Customer opening `/admin` sees "Admins only" | PASS | browser |
| Customer token → `/api/admin/stats`, `/api/admin/orders`, admin status change, `/api/seller/me` | PASS: 403 each | HTTP |
| Admin token → `/api/admin/stats`, order detail | PASS: 200 | HTTP |
| Another customer → that order, or cancelling it | PASS: 404 | HTTP |
| No token or a forged token → protected routes | PASS: 401 | HTTP |
| Forged payment verification on a COD order | PASS: 409 "This order can no longer be paid." | HTTP |
| Webhook while Razorpay is off | PASS: 404 "Webhook not configured." | HTTP |
| Refresh without the CSRF header / without a cookie | PASS: 403 / 401 | HTTP |
| Public tracking (case-insensitive number and email) | PASS: 200; unknown order 404 | HTTP |
| AI quiz without a key | PASS: `source: "rules"`, 3–4 in-budget picks and a card message; UI says "Matched from our curated catalog"; an injection attempt in the notes had no effect | browser + HTTP |
| AI input validation (control characters in a choice, negative budget, blank request) | PASS: 400 with field errors | HTTP |
| Malformed JSON | PASS: 400 problem detail | HTTP |
| Actuator only on the management port | PASS: 404 on 8091, `UP` with liveness/readiness on 9191 | HTTP |
| Security headers on API responses | PASS: `nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` | HTTP |
| Phone width (375 px): shop, product, order detail, quiz | PASS: no horizontal scrolling | browser |

### GG-10 reproduction (rate limit and `X-Forwarded-For`)

25 failed sign-ins to `/api/auth/login` from this machine (limit: 20 per minute per client IP), each run inside a single minute window:

| Requests | Current setting (`framework`) | `SERVER_FORWARD_HEADERS_STRATEGY=native` |
|---|---|---|
| No header | 20 × 401, 5 × 429 | 20 × 401, 5 × 429 |
| A different `X-Forwarded-For` each time | 25 × 401 (limit bypassed) | not run |
| `X-Forwarded-For: <spoofed>, 198.51.100.7` (a proxy appending the real address) | 25 × 401 (limit bypassed) | 20 × 401, 5 × 429 |

Whether Railway appends or replaces the header, and which address its proxy connects from, still has to be checked on Railway (BUG_REGISTER GG-10).

## Not run or blocked

| Check | Status | Reason |
|---|---|---|
| Docker image builds (`docker compose build`) | BLOCKED | Docker Desktop's engine isn't running on this machine. CI builds them on every push |
| Razorpay Checkout window in test mode | BLOCKED | no Razorpay test keys; the server side is covered by PaymentIT against a fake Razorpay |
| Live Gemini responses | BLOCKED | no key (by instruction); covered by mocked-provider tests |
| Email delivery | NOT TESTED | no SMTP; logging mode verified |
| Address lookup against Nominatim | NOT TESTED live | disabled locally; LocationIT uses a fake server |
| Graceful shutdown | NOT TESTED | `server.shutdown: graceful` is configured; the local processes were stopped by the tool, not by a signal |
| Backend dependency vulnerability scan | NOT TESTED | no OWASP/NVD database available offline |
| Real-browser contrast audit, screen readers | NOT TESTED | axe-core runs in jsdom only |
| Load or performance testing | NOT TESTED | out of scope |
| Anything on Railway, Vercel or the production database | BLOCKED | out of scope by instruction |

## Gift decision assistant (2026-10-29)

Branch `feat/gift-decision-assistant` (from `ec20b7c`); feature described in [GIFT_DECISION_ASSISTANT.md](GIFT_DECISION_ASSISTANT.md). Same machine, same throw-away MySQL on `127.0.0.1:3307`.

| Check | Before (`ec20b7c`) | After |
|---|---|---|
| Backend unit tests (`mvn clean verify -Pintegration`, surefire) | 242 | **281** passed (39 new) |
| Backend integration tests (failsafe, real MySQL) | 110 | **114** passed (4 new, in AiIT) |
| Frontend lint | PASS | PASS |
| Frontend tests (`npx vitest run`) | 140 | **142** passed (2 new; 2 quiz journeys updated for the new optional step) |
| Frontend production build | PASS | PASS |

`mvn clean` matters here: without it Maven reported a successful test compile while the tests still referenced the old record shapes; with it, 9 out-of-date test calls were found and updated.

Tests that failed or were missing before and now pass:

- `TextPreferenceParserTest`: 17 negation cases ("she hates perfume", "doesn't really like watches", "isn't a big fan of roses", "already has a watch", "perfume pasand nahi", "तिला perfume आवडत नाही", "chocolates नको"), plus 5 cues that must not rule anything out ("not sure…", "has no perfume yet", "no more than ₹2000").
- `AvoidListTest`, `FitReporterTest` (new), plus new cases in `RecommendationServiceTest`, `AiOrchestratorTest`, `GiftRequestServiceTest` and `AiIT`.
- `features.test.jsx`: the quiz's avoid step, match badge and checklist, the plan, and no results heading before results.
- `a11y.test.jsx`: axe-core on the results view.

Local end-to-end (backend jar on 8091 against `giftgenius_dev`, Vite on 5174):

| Journey | Result |
|---|---|
| Quiz: Partner · Birthday · Home & Decor · avoid perfume and sweets · Minimalist · ₹500–₹1,500 · name "Priya" | PASS: "4 gifts for Priya · Birthday · up to ₹1,500"; "Leaving out: Perfume, Sweets & chocolates"; 4 picks at 86% / 86% / 86% / 82% with ✓/✕ checks; plan of 3 kinds, all ≤ ₹1,500 |
| Notes "He already has a watch and doesn't like chocolates" | PASS: "Leaving out: Watches, Sweets & chocolates"; no chocolates shown; plan within ₹500 |
| `POST /api/ai/gift-request` "…she loves plants and already has a watch" | PASS: `understood.avoid = ["watches"]`, interests `["home decor"]` |
| Request sent by the quiz | PASS: answers and `avoid` only; the first name stays in the browser |
| Phone width (375 px) | PASS: no horizontal overflow; plan cards stack (each 286 px) |
| Colour contrast (axe-core in Chromium, results section, transitions paused) | FAIL → fixed (GG-19): 4 selectors below 4.5:1 before; 0 violations after, in light and dark |
