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

## Gift Studio (2026-10-30)

Same branch, on top of the decision assistant (uncommitted); feature described in [GIFT_STUDIO.md](GIFT_STUDIO.md). Same machine, same throw-away MySQL on `127.0.0.1:3307`.

| Check | Before (decision assistant) | After |
|---|---|---|
| Backend unit tests (`mvn clean verify -Pintegration`, surefire) | 281 | **290** passed (9 new: `BoxCompatibilityTest`, `GiftBoxServiceTest`) |
| Backend integration tests (failsafe, real MySQL) | 114 | **117** passed (3 new: `GiftBoxIT`) |
| Frontend lint (`npx eslint .`) | PASS | PASS |
| Frontend tests (`npx vitest run`) | 142 | **159** passed (16 in `studio.test.jsx`, 1 in `a11y.test.jsx`; 2 quiz journeys check the new studio links) |
| Frontend production build | PASS | PASS (the studio is its own lazy chunk: 40.2 kB, 12.5 kB gzipped) |

The first full frontend run had 158 of 159 passing. The seller sign-up journey (`seller.test.jsx`, no studio code involved) timed out at its 20 s limit while the backend build ran on the same machine. A second run of the whole suite, with nothing else running, passed 159 of 159.

What the new tests pin:

- **Share links:**
  - a friends link round-trips the whole gift;
  - a surprise link carries neither the budget nor the printed name;
  - malformed or tampered fragments: non-JSON, not an object, over-long, a hostile colour, extra fields such as photos, an out-of-range budget.
- **Suggestions and advice:** theme suggestions only from the shopper's answers; reveal orders per template; A/B advice that never predicts a reaction.
- **Journeys:**
  - the reveal step by step, with no prices;
  - theme, colour and wrap changing the 3D box's description;
  - Add to cart sending only the card message and the printed name;
  - the compare lab;
  - box suggestions, then a box built with buttons and drag and drop, with the server's checks;
  - both share links, a friend's link, and "make your own";
  - photos never in a link, released when removed and when the studio closes;
  - message to gift;
  - the product-page and quiz entry points.
- **Accessibility:** axe-core on every studio view, the start screen and a surprise link.
- **Mutation checks:** with the surprise link's budget exclusion undone, 2 tests failed; with the restart-on-new-URL fix undone, the share journey failed at "make your own". Both fixes were restored and the suite re-run.

Local end-to-end (backend jar on 8091 against `giftgenius_dev`, Vite on 5174; the browser pane had reduced motion on):

| Journey | Result |
|---|---|
| Reveal for product 1, birthday, ₹1,500 | PASS: 7 steps. Box closed, ribbon untied, lid propped behind, gift rising from the tissue, card, "Happy birthday!". No confetti, because reduced motion was on. "Play it for me" advances on its own |
| First look in a real browser | FAIL → fixed: the reveal was invisible (`.reveal` clashed with the scroll-reveal utility); renamed to `unbox-*` |
| 3D box, keyboard | PASS: focusable; → turns it from −32° to −17°; the hint is announced |
| Gift box: ₹1,500, 3 gifts, birthday (real engine) | PASS: 3 boxes, each ₹1,497 ("₹3 to spare"), one shared gift at most. Checks: occasion ✓, price ✓, "Mixed styles" ⚠, variety ✓, packaging "not checked" |
| Gift box built by hand | PASS: edit → remove (₹998, "₹502 left") → drag in Signature Perfume → "✕ Doesn't fit: ₹2,197: ₹697 over your ₹1,500 budget". Previewed with all 3 gifts, no prices |
| Surprise link | FAIL → fixed: it carried `budget: 1500`; it now carries only what the reveal shows. Opened: reveal only, no prices, tabs, controls or cart |
| "Make your own" from a surprise link; a share link pasted while the studio is open | FAIL → fixed: the previous gift stayed; now the start screen, and the shared reveal again on Back |
| Friends link | PASS: banner, read-only until "Edit your own copy"; name and theme carried |
| Message to gift, rules mode: "I want to thank my sister for always supporting me" | PASS: "We read: For: sibling"; Personal Memories suggested with its reason; 3 catalogue picks. Choosing one opened the studio with that theme, the printed-name field (a personalisable journal) and the suggested message |
| Quiz context in the studio link | FAIL → fixed: "Flowers & Fragrance" reached the studio as `flowers` only; the box request now carries `interests: ["flowers","fragrance"]` with recipient, occasion, style and budget |
| Colour contrast (axe-core in Chromium, transitions paused): 4 views, box checks (all 5 statuses), message-to-gift results, friends banner | Light: 0 violations. Dark: 1 → fixed (GG-20, 4.06:1); 0 after |
| Phone width (375 px), all 4 views | PASS: no horizontal page overflow. The fourth tab overflowed the tab bar → tighter tabs under 520 px |
| Product page | PASS: "🎁 Preview it as a gift" → `/studio?product=1` |

Not checked: real devices and screen readers (the checks above are axe-core and keyboard), Safari and Firefox rendering of the 3D box (only Chromium was used), and how the box performs on low-end phones.

## Reveal experiences and 360° studio view (2026-11-01)

Uncommitted on `feat/gift-decision-assistant`, on top of `83434be`; no backend code touched.

| Check | Before | After |
|---|---|---|
| Frontend lint | PASS | PASS |
| Frontend tests (`npx vitest run`) | 159 | **216** passed (`reveal-experience.test.jsx`, `reveal-studio.test.jsx`, and all five experiences in `a11y.test.jsx`) |
| Frontend production build | PASS | PASS (studio chunk 65.4 kB, 20.2 kB gzipped) |

Deliberate breaks, each caught by a test and then restored: a printed name on any gift; a price in the reveal; resuming swinging back to the start; pause losing its place; the timer not cleaned up; the budget in surprise links; confetti ignoring skip and reduced motion; Memory asking for a photo it has; the turntable never spinning; a variable shadowing a site token; photo prints leaking into other experiences (missed at first, so a test was added).

Found by inspecting the running app, and fixed:

| Defect | Cause |
|---|---|
| Box walls lost their depth in Sentimental and Minimal | An opacity animation on the 3D body flattened it |
| Replay button invisible in light theme | An experience variable named `--ink` overrode the site's token |
| Ribbon missing from the lid | A rule made all bands `position: relative`, out of their 3D placement |
| Grid squares across the Birthday box | A background-size list tiled the shading gradient |
| Bow undersides muddy on light ribbons | A fixed shadow colour; it now follows each ribbon |

In Chromium against the local backend: all five experiences inspected closed and at their final frames, plus the moments of the ribbon, lid, confetti and message; the 360° view at several angles, closed and open; 0 contrast violations on all five final frames and the selector, in light and dark; no horizontal overflow at 375 px, with captions inside the stage.

Not checked: Safari, Firefox, real phones, screen readers and frame rate on low-end devices. The browser pane was hidden and throttled, so mid-stage frames were captured by holding animations at fixed times, and the motion and the continuous turntable haven't been watched at full frame rate. The turntable's motion is covered by tests.

## Three.js Gift Studio (2026-11-02)

Uncommitted on `feat/gift-decision-assistant`, on top of `69292b4`; no backend code touched. Measured in Chrome on an Intel UHD 620 laptop, on a production build with an empty cache.

| Device | Player | Quality | Turntable | Royal reveal | Birthday reveal | Ready |
|---|---|---|---|---|---|---|
| Normal GPU, 1x | 3D | high or medium | 57 fps | 55 fps | 57 fps | 2.5 to 5.3 s |
| Normal GPU, 2x | 3D | medium, 1.25x | 58 fps | 52 fps | 52 fps | 4.0 s |
| Phone width, normal GPU | 3D | high, 2x | 60 fps | 59 fps | 59 fps | 4.3 s |
| Simulated 2x slower | 3D | low, 1.5x | 60 fps | 54 fps | 58 fps | 13.3 s |
| Simulated 4x and 6x slower | CSS | none | none | none | none | no 3D downloaded |
| Software rendering | CSS | none | none | none | none | no 3D downloaded |

In real time: all five reveals played start to finish; play, pause, resume, skip, reset, replay, the turntable and switching look; nothing drawn at rest or while paused; Your view, Compare and Gift box still present. No contrast violations in the room. 26 deliberate breaks, all caught by tests and restored.

Not checked: real phones, Safari, Firefox and screen readers. The CPU limit and quality budgets come from simulations on one laptop.

## Gift Studio refinements (2026-11-02)

Uncommitted, on top of the section above.

- **Several gifts:** 4, 5 and 6 real gifts captured; all shown in the box, named and counted below it.
- **Catalogue photos:** all 20 now appear in the box. Before, 16 did. Two needed only an https link; two more are laid over the print as ordinary images, because their hosts send no permission for WebGL.
- **Slow start**, on a page slowed 2x in Chrome: controls disabled with a message, a still shown at once, and *Play when ready* played the reveal once ready.
- **Share links**, in Chrome: old Classic, Surprise and Sentimental links play as before with no 3D code; new links play the experience named; an unknown one opens on Royal; no prices, chooser or photo prompt for recipients.
- **Tests:** 37 deliberate breaks, all caught; one was missed at first, so a test was added.
- **Found in the last check:** changing the device's motion setting mid-visit, then editing the gift, tore the scene down and took the page with it. The setting is now read once per visit, and a test covers it.

Not checked: real phones, Safari, Firefox and screen readers. A hosted production site was not tested, so the https links and laid-over images haven't been seen under its content security policy; the policy in `nginx.conf` allows images from any https host.

## Compare in the 3D studio (2026-11-03)

Uncommitted, on top of the sections above. Measured on a production build made for review, in Chrome on this laptop (Intel UHD 620), against the local test database.

| Check | Desktop (1400 wide) | Phone (390 wide) |
|---|---|---|
| Quality chosen | medium | medium |
| Ready after opening the tab | 1.5 to 2.5 s | 1.8 s |
| Turning | 53 to 59 fps | 60 fps |
| Opening / closing | 51 to 53 / 54 to 59 fps | 58 / 59 fps |
| Frames over 50 ms | none | none |
| axe-core, contrast included | 0 violations | 0 violations |

- **Slower CPU:** 2x slower gets 3D at low quality, ready in 7 to 12 s, controls disabled with a message until then. 4x slower got the CSS boxes with no 3D downloaded on one run and passed the CPU check on another; the 30 second limit now holds even when the scene arrives inside one long task (found here, fixed, tested).
- **Without WebGL:** the CSS boxes, no 3D code downloaded, *Closed* / *Open* working, no turning controls shown.
- **Interactions:** showing a theme as B, choosing B's gift, *Use option B* reaching *Your view*, *Use* on a tile, the table, switching tabs three times and back, no errors.
- **The five reveal looks:** rendered before and after, closed, turned and open: identical (at most 4 of 256 levels on 1 pixel, the same as two runs of the unchanged code).
- **Found in measurement and fixed:** the first measurement ran while gift photos uploaded, and fell to the lowest quality; the first opening stalled 375 ms on drawing the gifts for the first time.
- **Tests:** 33 new; 33 deliberate breaks, all caught.

Not checked: real phones, Safari, Firefox and screen readers. The CPU limit and quality budgets come from simulations on one laptop.

## Your view in the 3D studio (2026-11-03)

Uncommitted, on top of the sections above. Measured on a production build made for review, in Chrome on this laptop, against the local test database.

| Check | Desktop (1400 wide) | Phone (390 wide) |
|---|---|---|
| Quality chosen | medium | high |
| Ready after opening the tab | 1.5 to 6.4 s (the longest on a first, cold start) | 1.5 s |
| Turning, closing, opening | 60 fps | 60 fps |
| Frames over 50 ms | none | none |
| axe-core, contrast included | 0 violations | 0 violations |

- **Add to cart, in the real app:** the cart count went up, and the stored line carried the product, the quantity and the card message, as before.
- **Card styles:** all five checked on screen; changing the style in the controls changes both the card and the card in the lid.
- **Without WebGL:** the CSS box, open, closing and opening, with no 3D code downloaded.
- **Tests:** 12 new; 16 deliberate breaks, all caught (including the message or printed name no longer reaching the cart). One full run had two unrelated tests time out under load (a seller sign-up test and a reveal test); both passed alone and in the next full run.

Not checked: real phones, Safari, Firefox and screen readers.

## Gift box in the 3D studio (2026-11-03)

Uncommitted, on top of the sections above. In Chrome on this laptop, on a production build made for review, against the local test database.

- **The journey, at 1400 and 390 wide:** suggestions within the budget (3 boxes), *Edit this box*, adding from the shelf, the box in the studio filling, the meter going over budget, the checks, *Preview this box* reaching *Their view*. No errors; axe-core, contrast included, 0 violations at both widths. Ready 1.7 to 3 s after opening the tab.
- **Smoothness:** in the first runs (on the development server), turning ran at 60 fps (worst frame 17 ms) with four gifts in the box. The later runs, on the review build, were capped at 30 fps for every page, Your view included: the laptop was on battery at 15%, where Chrome holds pages to 30 fps. The GPU cost per frame then was 14.7 ms empty and 18.9 ms with three gifts. While capped, the running check also stepped down a quality once.
- **Without WebGL:** the CSS box, open, with no 3D code downloaded.
- **Tests:** 9 new (8 for the tab, 1 journey); 13 deliberate breaks, all caught in the end; 2 were missed at first (the page not passing its look to the box, and a seventh gift dragged in), so a test was added for each.

Not checked: real phones, Safari, Firefox and screen readers.

## Website entry (2026-11-05)

Uncommitted, on top of the sections above. In Chrome on this laptop, on a production build, against the local test database.

| Check | Desktop (1440x900, 1920x1080) | Phone (390x844) | Reduced motion |
|---|---|---|---|
| Downloads | 26 kB still, 184 kB arrival, 530 kB opening | 14 kB, 97 kB, 335 kB | two stills, 38 kB |
| Opening film | 123 frames, 0 dropped | 123 frames, 0 dropped | no film |
| From Enter to gone | 5.4 s | 5.4 s | under 1 s |
| 3D code downloaded | none | none | none |
| axe-core, contrast included | 0 violations | 0 violations | 0 violations |

- **First visit:** the welcome screen followed 4.6 s after Enter, focused on its heading, with its own scroll lock; the entry's lock was gone. A second load in the same session showed no entry.
- **Found and fixed:** the scroll lock was undone by the site's shared overlay lock as the page mounted (also true of the old entry); and, during the rebuild, the key handler re-locked scrolling after leaving.
- **Tests:** 21 for the entry (a new file) and three updated; 17 deliberate breaks, all caught in the end (one was missed at first, so a test was added).

Not checked: real phones, Safari, Firefox and screen readers. Battery: on battery at 78% for these runs; the film's smoothness doesn't depend on the page's frame rate.

### Entry on the site's teal (2026-11-05, after review)

The owner asked for the site's main background colour instead of black. The film was rendered again with the studio's walls and floor in the light teal of `--bg` (#E6F7FA), the box, ribbon and lighting unchanged, and the page restyled in the site's ink, readable gold and dark button.

| Check | Desktop (1440x900) | Phone (390x844) | Reduced motion |
|---|---|---|---|
| Downloads | 35 kB still, 181 kB arrival, 503 kB opening | 19 kB, 89 kB, 321 kB | two stills, 57 kB |
| Opening film | 123 frames, 0 dropped | 123 frames, 0 dropped | no film |
| From Enter to gone | 5.4 s | 5.4 s | as before |
| 3D code downloaded | none | none | none |
| axe-core, contrast included | 0 violations | 0 violations | 0 violations |

- **Colour match:** the rendered room's edges are exactly #E6F7FA; after H.264 encoding and decoding they are within 2 levels of it (228, 246, 249), and stay there while the card comes up.
- **Encoding:** CRF 25 instead of 23, because a light background costs more to encode; side by side with CRF 23 no difference or banding was visible. Each framing stays under the 900 kB test limit (wide 757 kB).
- **Tests:** 422, lint and build pass; one new test ties the entry's background to the site's `--bg-light` token and checks the ink and gold.
- On battery at 30% for these runs.

### Entry in light and dark (2026-11-05, after review)

The owner asked for the entry to follow the system theme: light teal in light mode, the dark theme's background in dark mode. The site already followed the system theme (`theme-init.js`, unless the visitor chose one with the header toggle); the entry now follows the site, with its own dark films (room #0F1A1C, rendered and encoded as the light ones).

| Check (Chrome, production build) | Light, desktop | Dark, desktop | Dark, phone | Dark, reduced motion |
|---|---|---|---|---|
| Entry background | rgb(230, 247, 250) | rgb(15, 26, 28) | rgb(15, 26, 28) | rgb(15, 26, 28) |
| Files | the light set only | the dark set only, 640 kB | 376 kB | two stills, 46 kB |
| Opening film, no screenshots | 123 frames, 0 dropped | 0 dropped in 2 of 3 runs; the first, cold, dropped 8 | 0 dropped | no film |
| axe-core, contrast included | 0 violations | 0 violations | 0 violations | 0 violations |
| 3D code downloaded | none | none | none | none |

- **Colour match:** the dark films' edges decode within 2 levels of #0F1A1C (14, 24, 27).
- **Found and fixed:** with storage blocked, `theme-init.js` gave up and the site stayed light whatever the system said; it now falls back to the system's setting.
- **Tests:** 428, lint and build pass; new tests for the dark films and colours, and for `theme-init.js` (system dark, system light, the visitor's choice winning, blocked storage).
- On battery at 25% and discharging for these runs, which is the likely cause of the one cold run's dropped frames.

**Approved** by the owner on 2026-11-05. The old entry was then removed (its rules in `entry-scene.css` and `pages.css`, `penguin.css`, eight animations only it used, `public/mascot.jpg`); every removed class was checked to be unused elsewhere. Lint, 428 tests and the build pass; the CSS bundle went from 212 kB to 204 kB; the homepage renders as before with no console errors.

**Their view's time limit (2026-11-05):** the 30-second start-up limit in *Their view* now also holds when the scene arrives inside one long task, before the timer gets its turn (the same gap Compare had, fixed the same way). A new test fails without the fix and passes with it; lint, 429 tests and the build pass.

## Order emails, Stage 2.1: reliable delivery (2026-11-08)

Committed locally on `feat/gift-decision-assistant` (not pushed). Backend only; design in [EMAIL_NOTIFICATIONS.md](EMAIL_NOTIFICATIONS.md). No SMTP provider was configured
and no real email was sent: delivery was exercised with in-test SMTP stand-ins against a throw-away local MySQL 8.0.43
(127.0.0.1:3307, database `giftgenius_test`).

| Check | Result |
|---|---|
| Backend unit tests (clean build) | 305 passed (290 before, 15 new: `EmailOutboxSenderTest`, `OrderNotifierTest`) |
| Backend integration tests | 130 passed (117 before, 13 new in `EmailOutboxIT`; `PaymentIT` and `SellerMarketplaceIT` now check the queue) |
| Migrations from empty | V1 to V7 applied in order |
| V7 on a populated pre-V7 database | table created; checksums of `orders`, `order_items`, `users`, `products`, `seller_profiles` and the other existing tables identical before and after (37 orders, 46 lines, 87 users) |
| Frontend lint, tests, build | clean, 429 passed, passes (frontend unchanged) |

What the new tests prove:

- **No duplicates:** the same email queued twice, or from 8 transactions at once, is stored once and no queueing call
  fails; the browser and the Razorpay webhook confirming one payment at the same moment queue one confirmation (3
  rounds); 4 senders draining 60 emails at once send each exactly once.
- **Sent means accepted:** marked `SENT` only after the SMTP stand-in accepts the message; without a provider every
  email is `NOT_SENT` with no `sent_at`.
- **Bounded retries:** a provider that stays down gets exactly 1 + retries attempts, then `FAILED`, and later passes
  leave it alone; one that recovers gets the email on the retry; a failed attempt waits its delay; a refused address
  fails at once; an email interrupted mid-delivery is recorded as failed and never resent; one still within its lease
  is left alone.
- **Isolation:** a queueing error (a missing order, no recipient) doesn't undo the transaction it ran in; an order whose
  emails failed or weren't sent stays `CONFIRMED`.
- **Privacy and safe records:** seller emails carry only that seller's lines and none of the customer's name, email,
  phone, street, city or PIN code; logs and stored errors mask addresses.
- **Deliberate breaks:** 14 faults introduced one at a time, all caught. One (ignoring the batch size) made a unit test
  loop forever instead of failing, so the sender's unit tests now have a 10-second limit, run in a separate thread so
  a busy loop can't outlast it.

Found and fixed while testing: the sender had two constructors and Spring couldn't choose one, so the application
didn't start (every integration test failed at once); the production constructor is now marked `@Autowired`.

### Stage 2.1 review fixes (2026-11-09)

Committed locally with Stage 2.1 (not pushed). The owner approved five fixes after the reliability and security review; the delivery guarantee is now
written down in [EMAIL_NOTIFICATIONS.md](EMAIL_NOTIFICATIONS.md#delivery-guarantee). Same throw-away MySQL; no SMTP
provider, no real email.

| Check | Result |
|---|---|
| Backend unit tests (clean build) | 319 passed (305 before; 14 new) |
| Backend integration tests | 138 passed (130 before; 8 new) |
| Frontend lint, tests, build | clean, 429 passed, passes (frontend unchanged) |
| Deliberate breaks of the fixes | 14 of 14 caught |

- **Stable Message-ID:** every attempt at an email carries `<gg-outbox.<id>.<hash of its key>@<MAIL_FROM domain>>`;
  tested across retries, through Spring's real `JavaMailSenderImpl` (with a recording connection, no network), and in
  `EmailOutboxIT`. Exactly-once is not claimed: a reply timeout after the server accepted a message is retried and can
  deliver twice.
- **Crash after acceptance:** the server accepts, recording SENT fails: the email stays SENDING, no other sender touches
  it within its lease, then it is recorded as FAILED ("interrupted") with no `sent_at`, and the server received it
  exactly once. A send that outlives its lease and then succeeds is recorded as SENT.
- **Monitoring and reconciliation:** gauges by status, the oldest waiting email's age and how overdue it is, and the
  number of confirmed orders with no confirmation queued, refreshed every 5 minutes; a counter of queue failures by
  reason. Reconciliation finds such an order, ignores orders confirmed before V7, and changes nothing.
- **Production retry configuration:** the running application and `application.yml` both give 1 min, 5 min, 15 min,
  1 h and 5 attempts; tests read the schedule from the file instead of a copy.
- **Content isolation:** an email that can't be built is skipped and counted; with every email failing, a real order
  is still placed, confirmed and cancelled through the API.
- **Found while testing the fixes:** one deliberate break (resending after a failure to record SENT) made an
  integration test loop until the run's time limit instead of failing; `EmailOutboxIT` now has a 60-second limit per
  test and catches it in under a minute.
- **Migration:** unchanged since the 2026-11-08 checks (empty database, and a populated pre-V7 database with identical
  checksums before and after).
