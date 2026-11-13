# GiftGenius production-readiness gate

Assessed 2026-10-28 on branch `audit/production-readiness` (base `refactor/architecture` @ `5074d69`, fixes in one local commit, not pushed). Statuses: **PASS** (verified by an executed check), **FAIL** (verified problem still open), **BLOCKED** (needs access or a service this audit didn't have), **NOT TESTED**.

Updated 2026-11-12 after the full-roadmap run on `feat/gift-decision-assistant` (uncommitted on `8486cc7`): order emails
to customers, sellers and the store owner, the Classic reveal retired, the gift assistant, and four audit rounds of fixes.

## Verdict

**READY WITH BLOCKERS (2026-11-12, updated 2026-11-13).** The code passes every check that can run here: 358
backend unit and 180 integration tests on MySQL 8.0.43, 457 frontend tests, lint, the production build and
`npm audit` (0). 37 of 38 deliberately reintroduced defects were caught at once, and a test now catches the 38th.
The release blockers below are infrastructure, provider credentials and owner decisions; the open code defects
(GG-36, GG-45, GG-53, see "Open code defects") are not release blockers but should be scheduled. The Docker images
could not be built on this machine.

Earlier assessment (2026-10-28): the **code** is in a production-ready development state for the journeys that can be exercised locally: every supported check passes (242 unit, 110 integration and 140 frontend tests, lint and build), the confirmed defects found in this audit are fixed with regression tests, and the main shopper, admin and authorization journeys were verified against a real backend and database.

The **live site is not operational and is not release-ready.** Release is blocked by infrastructure, not code:

1. Railway's trial has expired and the production MySQL service has been reported offline. Database recovery or a restore from backup, a working host, its environment variables and a live smoke test are all outstanding.
2. Online payment and the Gemini path have only been verified against fakes and mocks.
3. One security item (GG-10) needs a decision and a check on the hosting platform.

This does not claim the system is "100 % production-ready"; it states what was verified and what remains.

## Checklist

### Core user journeys

| Item | Status | Evidence |
|---|---|---|
| Home, catalogue, categories, search, filters, occasions, product pages | PASS | IT, browser and HTTP checks |
| Not-found handling (unknown product, malformed link, unknown route, deep-link refresh) | PASS | browser; nginx `try_files` and Vercel rewrite in config |
| Guest cart and wishlist persist, merge once at sign-in | PASS | frontend tests, browser |
| Register, sign in, session refresh, sign out, password reset | PASS (locally) | AuthFlowIT, auth tests, browser |
| Checkout with COD, coupons, delivery options; totals shown equal totals charged | PASS | IT, browser order `GG-PTGRH2AK` |
| Online payment (Razorpay) | BLOCKED | server side PASS against a fake Razorpay (PaymentIT); no test keys for the real window |
| AI quiz, card messages, free-text requests | PASS with rule fallback; Gemini BLOCKED | AiIT (mocked model), browser `source: rules` |
| Seller marketplace and admin back office | PASS | SellerMarketplaceIT, seller and admin frontend tests |
| Email notifications (customer, seller, store owner; HTML and text) | PASS against a local test SMTP server; real provider NOT TESTED | `EmailDeliveryIT`, `EmailDeliveryAppIT` (GreenMail on 127.0.0.1: real order through the API, delivered over SMTP), `OrderEmailsTest`, `EmailOutboxIT`; no provider credentials were used and no real email was sent |
| Gift assistant (catalogue-only answers, in stock and within budget, no orders) | PASS with the rule engine and a mocked model; Gemini BLOCKED | `GiftAssistantIT`, `GiftAssistantServiceTest`, `assistant.test.jsx` |
| Gift Studio without the Classic reveal; old share links still open | PASS | `studio.test.jsx`, `studio-3d.test.jsx` (links built from the old format) |

### Security and authorization

| Item | Status | Evidence |
|---|---|---|
| Role checks on admin and seller APIs; ownership of orders, carts, products | PASS | IT and live checks (403/404) |
| JWT validation, refresh rotation and reuse detection, CSRF header on cookie endpoints | PASS | AuthFlowIT, JwtServiceTest, live checks |
| Payment signatures (browser and webhook), amount and currency checks, idempotency | PASS | PaymentIT, RazorpaySignaturesTest |
| Open-redirect protection after sign-in | PASS after GG-03 | frontend test |
| Secrets out of code, history, bundle and logs | PASS (GG-07 fixed) | scans and log checks |
| Per-IP rate limiting behind the production proxy | PASS locally; host check BLOCKED | GG-10 and GG-24 fixed: `X-Forwarded-For` read only from trusted proxies (`forward-headers-strategy: native`), `Forwarded`/`X-Forwarded-Prefix` ignored, decoded paths, bounded memory (`RateLimitClientAddressIT`, `RateLimitBehindProxyIT`, `RateLimitFilterTest`). On the chosen host, confirm its proxy's address range (`SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES`) |
| Order placement abuse (many COD orders) | PARTLY FIXED | `POST /api/orders` rate-limited per client; a per-customer cap is an owner decision (GG-35) |
| Security headers | PASS on nginx and the API; Vercel lacks a CSP (GG-11, open) | config review, live headers |
| Frontend dependency advisories | PASS after GG-08 | `npm audit`: 0 |
| Backend dependency vulnerability scan | NOT TESTED | no NVD database offline |

### Data integrity and database

| Item | Status | Evidence |
|---|---|---|
| Server-side pricing; client amounts never trusted | PASS | code review, IT |
| Stock and coupon reservation under concurrency; locking on order changes | PASS | CheckoutIT, PaymentIT, SellerMarketplaceIT (parallel tests) |
| Checkout retry after a payment-provider outage | PASS after GG-01 | PaymentIT |
| Migrations apply on an empty database and validate on restart | PASS | local runs |
| Existing migrations unchanged (no checksum mismatch on an existing database) | PASS | V1–V7 untouched; V8 (nullable `email_outbox.body_html`) and V9 (an index) are additive and apply on every integration run |
| Production database state, backups and restore | BLOCKED | production MySQL reported offline; no access |
| Migration rollback | NOT TESTED | Flyway Community has no undo; plan forward fixes or restores |

### Contracts, errors and observability

| Item | Status | Evidence |
|---|---|---|
| Every frontend API call maps to a backend route with the same method | PASS | route comparison (REPOSITORY_AUDIT.md §4) |
| Problem-detail errors with safe messages; no stack traces in responses | PASS | live checks |
| Health (liveness/readiness) and Prometheus on a separate port | PASS locally | live check on the management port |
| Actuator access: probes open and status-only; metrics need `METRICS_SCRAPE_TOKEN`; the rest closed, on either port | PASS locally (2026-11-09; committed locally, not pushed) | `ManagementSecurityIT`, `ManagementSecurityNoTokenIT`, `ManagementSecuritySamePortIT` (real HTTP) |
| Docker container health check with the new Actuator security | NOT VERIFIED | the readiness request it makes passes over HTTP in `ManagementSecurityIT`; the built image's `HEALTHCHECK` hasn't been run (needs Docker started, with the owner's go-ahead) |
| Health check reachable by Railway | BLOCKED | the management port isn't the public port; Railway's health check path must be configured accordingly |
| Fail-fast startup on missing secret or database | PASS | jar runs |
| Graceful shutdown | NOT TESTED | configured (`server.shutdown: graceful`) |

### Build, configuration and operations

| Item | Status | Evidence |
|---|---|---|
| Frontend lint, tests, build; backend unit and integration tests | PASS (2026-11-13: 358 unit, 180 integration, 457 frontend) | TEST_RESULTS.md |
| CI database version | NOT VERIFIED | CI's service is `mysql:8.4`; this run used 8.0.43. PR CI not rerun on these changes |
| Tests need no paid service or live credential | PASS | fakes and mocks for Razorpay, Nominatim, Gemini, mail |
| Docker Compose configuration (base and production overlay) | PASS | `docker compose config` |
| Docker image builds | BLOCKED | On 2026-11-12 the daemon ran, but every Alpine base image (`node:22-alpine`, Temurin Alpine) failed with "exec format error" on this machine, also after a cache prune and re-pull; CI builds them |
| CI workflow covers backend (with MySQL), frontend and Docker | PASS (review) | `.github/workflows/ci.yml`; not run here |
| Environment variables documented | PASS | `.env.example`, REPOSITORY_AUDIT.md §8 |
| Node version alignment | PASS | GG-13 fixed: `engines` `^22.22.2 \|\| >=24.15.0`; Docker (`node:22-alpine`) and CI (`node-version: "22"`) both take the newest Node 22 release |
| Performance and load | NOT TESTED | |
| Accessibility | PASS for automated checks (axe-core in jsdom, keyboard tests); real-browser contrast and screen readers NOT TESTED | frontend tests |
| Phone-width layout | PASS | 375 px checks |

## Open code defects

Known, documented in BUG_REGISTER.md, not fixed. None blocks a release on its own; each needs a decision or an API
change.

| ID | Severity | Defect | What it needs |
|---|---|---|---|
| GG-36 | Medium | Saving a product form overwrites its stock with the form's value, losing units reserved by orders meanwhile | The product API to carry a version (or stock to be changed by delta) |
| GG-45 | Medium (suspected) | The guest cart and wishlist merge at sign-in isn't exactly-once: a retry after a lost response could add the lines twice | An idempotency key on the merge endpoints |
| GG-53 | Low | The order confirmation page says "We've emailed a confirmation" even when no email provider is configured | The API to say whether the email was queued for sending |

Also open, lower severity or owner decisions: GG-35 (per-customer cash-on-delivery cap), GG-37 to GG-40, GG-11,
GG-12, GG-15.

**GG-28, fixed and verified on 2026-11-13** (it had been listed as fixed on 2026-11-11, but that fix didn't take
effect): a deadlock while queueing an order email is now passed on, so the order fails with a retryable 409 and
nothing of it is committed, instead of the request going on as if the order had been saved. Verified by 7 new unit
tests, an integration test through the API (no order, stock, email or cart change left behind; the retry succeeds)
and 9 deliberate breaks, all caught.

## Release blockers and external dependencies

| # | Blocker | Owner action |
|---|---|---|
| 1 | Production database offline (Railway trial expired) | Decide the host; recover the MySQL volume or restore the latest backup into a new instance; verify the data before connecting any app |
| 2 | No running backend host | Choose and provision a host (Railway paid plan, another PaaS, or the repository's Docker Compose + Caddy setup on a VM) |
| 3 | Production environment variables | Set them on the new host (list in REPOSITORY_AUDIT.md §8). Cross-site Vercel → API needs `CORS_ALLOWED_ORIGINS`, `COOKIE_SAME_SITE=None`, `COOKIE_SECURE=true`, `APP_PUBLIC_URL`; Vercel needs `VITE_API_BASE` |
| 4 | Rate-limit trust | The API now trusts `X-Forwarded-For` only from private and loopback proxies. On the chosen host, confirm the proxy's address range; if it is public, set `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` to it, or every visitor shares one limit |
| 5 | Razorpay | Test keys first, webhook URL and secret, one test-mode payment end to end, then live keys (only with the owner's approval) |
| 6 | Gemini | Optional; set `GEMINI_API_KEY` on the backend and run one permitted live call; otherwise the rule engine answers |
| 7 | SMTP | Set `SMTP_*`, `MAIL_FROM` and `NOTIFY_ADMIN_EMAILS`; place one test order and check the customer, seller and owner emails arrive (and land outside spam: SPF/DKIM for the sending domain); receive one password-reset email |
| 8 | Management port | On the chosen host keep port 9091 unpublished; set `METRICS_SCRAPE_TOKEN` (a long random value) only if Prometheus will scrape; optionally `MANAGEMENT_SERVER_ADDRESS=127.0.0.1` where nothing scrapes from another container |
| 9 | Live smoke test | After deployment approval: home, search, product, sign-in, COD order, admin sign-in, webhook delivery |

Deployment, merging and pushing remain out of scope until the owner approves them separately.
