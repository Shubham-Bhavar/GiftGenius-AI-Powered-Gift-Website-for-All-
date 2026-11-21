# GiftGenius operations guide

How to host, configure, back up and watch GiftGenius. Everything here is taken from the repository as of
2026-11-14 (`docker-compose*.yml`, `deploy/`, `.env.example`, `application.yml`). Where something hasn't been run
for real, it says so: no production host, SMTP provider, Gemini key or Razorpay account was available to verify it.

## 1. Hosting requirements

| Need | Detail |
|---|---|
| Host | Linux with Docker Engine and Compose v2 (the repository's stack), or any platform that runs the two images |
| Database | MySQL **8.0.16 or newer** (V6 adds `CHECK` constraints, which older 8.0 releases parse but don't enforce). Tested on 8.0.43 locally and 8.4 in CI |
| Public ports | 80 and 443 (Caddy). Nothing else |
| Never public | The API (8080, reached only through nginx) and the management port **9091** |
| Domain | `DOMAIN` with DNS pointing at the host; Caddy gets and renews the certificate |
| Memory | The API runs with `-XX:MaxRAMPercentage=75`; give its container at least 1 GB |

Start: `cp .env.example .env`, fill it in (section 2), then
`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.

**Health checks.** Readiness: `GET http://127.0.0.1:9091/actuator/health/readiness` → `{"status":"UP"}` (open, status
only). Liveness: `/actuator/health/liveness`. The backend image's `HEALTHCHECK` uses readiness on `MANAGEMENT_PORT`;
the frontend image's uses `GET /healthz`. A platform health check that can only reach the public port should use the
site itself (`/`) or be pointed at 9091 on the private network.

**Verification status.** CI builds both images; from 2026-11-14 the CI Docker job also starts the stack and checks
health, the site, the API, metrics staying closed and 9091 staying unpublished, but that job has not run yet (it
runs on the next push). Locally, Docker Desktop on the development PC can't run current Alpine images (corrupted
layer storage), so the containers have **not** been run here.

## 2. Environment variables

`.env.example` lists every variable with a comment. The ones a production host must set:

| Variable | Required | Notes |
|---|---|---|
| `DOMAIN`, `APP_PUBLIC_URL` | yes | e.g. `shop.example.com`, `https://shop.example.com` (used in email links) |
| `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` | yes | long random values |
| `JWT_SECRET` | yes | `openssl rand -base64 48`; the API refuses to start without it |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | yes | 12+ characters; see README "Admin account" |
| `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=Strict` | defaults | `None` only if the site and API are on different sites (with `CORS_ALLOWED_ORIGINS`) |
| `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` | only if the proxy in front of the API connects from a public range | otherwise every visitor shares one rate limit |
| `METRICS_SCRAPE_TOKEN` | if Prometheus scrapes | empty: metrics refused to everyone (fail closed) |
| `SMTP_*`, `MAIL_FROM`, `NOTIFY_ADMIN_EMAILS`, `MAIL_TIME_ZONE` | for email | section 4 |
| `GEMINI_API_KEY`, `AI_*` | optional | section 5 |
| `RAZORPAY_*` | for online payment | section 6 |

Never commit `.env` (it is in `.gitignore`).

## 3. Backups and restore

The production overlay runs a `backup` container (`deploy/backup.sh`): a compressed `mysqldump` of the `giftgenius`
database into `./backups/` every 24 hours, keeping `BACKUP_KEEP_DAYS` (default 14). Copy `./backups/` off the host
(for example `rclone` or `aws s3 sync` from cron); a backup on the same disk isn't a backup.

Restore into a running stack (replaces the data in `giftgenius`):

```bash
gunzip -c backups/giftgenius-YYYY-MM-DD-HHMM.sql.gz | docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -u root giftgenius
```

Test a restore before you need one: restore the latest file into a separate, empty MySQL and start the API against
it; Flyway validates the schema on start. **Not yet verified**: no production backup exists to test, and the backup
container hasn't been run (Docker unavailable locally).

Migrations are forward-only (Flyway Community has no undo). V2–V10 are additive; to roll a release back, restore the
backup taken before it or deploy a fix forward.

## 4. Email (SMTP)

Order emails are queued in the `email_outbox` table with the order and sent in the background
(see [EMAIL_NOTIFICATIONS.md](EMAIL_NOTIFICATIONS.md)). Set:

```
SMTP_HOST=smtp.your-provider.example   SMTP_PORT=587   SMTP_USERNAME=...   SMTP_PASSWORD=...
MAIL_FROM=GiftGenius <orders@your-domain>   NOTIFY_ADMIN_EMAILS=owner@your-domain
```

STARTTLS and SMTP sign-in are on by default (`SMTP_STARTTLS`, `SMTP_AUTH`). Without `SMTP_HOST` nothing is sent: the
emails are recorded as `NOT_SENT`, and the order page says no confirmation was sent (GG-53).

What each state means: **queued** (`PENDING`, in the table), **accepted** (`SENT`: the provider's SMTP server took
it), **failed** (`FAILED`, after the configured retries or a permanent refusal). Accepted is not delivered: inbox
delivery, bounces and spam placement are only visible in the provider's dashboard.

For the sending domain, publish what the provider asks for: **SPF** (a `TXT` record including the provider), **DKIM**
(the provider's key records), and **DMARC** (`_dmarc` `TXT`, start with `p=none; rua=mailto:...`, then tighten). Send
one test order to an address you control and check it arrives outside spam. **Not yet verified** with a real
provider; delivery was tested against a local GreenMail SMTP server only.

## 5. Gemini (optional)

`GEMINI_API_KEY` from Google AI Studio; `GEMINI_MODEL` (default `gemini-2.5-flash`); `AI_DAILY_CALL_LIMIT` (default
500) and `AI_QUOTA_COOLDOWN` cap cost. Without a key, or when the model fails, times out or answers badly, the rule
engine answers and responses say `source: rules`. The model only re-ranks and words products the catalogue already
chose (product ids it invents are discarded); prices, stock and links always come from the database. In the gift
assistant, model text claiming prices, discounts, stock or delivery terms is also replaced. **Not yet verified**
against the live Gemini API.

## 6. Razorpay (online payment)

1. In Razorpay's dashboard, use **test mode** keys (`rzp_test_...`) first: `RAZORPAY_ENABLED=true`, `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`.
2. Add a webhook to `https://<DOMAIN>/api/payments/razorpay/webhook` for `payment.captured`, `order.paid` and
   `payment.failed`, and set the same secret as `RAZORPAY_WEBHOOK_SECRET`. Keep automatic capture on.
3. Place one order with a Razorpay test card, check it becomes `CONFIRMED`/`PAID`, cancel one and check
   "Refund in progress" (refunds are issued in the Razorpay dashboard).
4. Only then switch to live keys, with the owner's approval.

**Not yet verified** with real Razorpay test keys; the server side is tested against a local fake Razorpay
(`PaymentIT`).

## 7. Monitoring and incidents

Prometheus scrapes `http://<backend>:9091/actuator/prometheus` with `Authorization: Bearer $METRICS_SCRAPE_TOKEN`,
from inside the private network. Worth alerting on:

| Metric | Alert when |
|---|---|
| `giftgenius_email_outbox_oldest_overdue_seconds` | above 900 (emails are stuck) |
| `giftgenius_email_outbox_emails{status="FAILED"}` | rising |
| `giftgenius_email_confirmations_missing` | above 0 (a confirmed order without a confirmation email) |
| `giftgenius_email_queue_failures_total` | rising (by `reason`) |
| JVM memory, HTTP 5xx rate, readiness | as usual |

Incidents:
- **API not ready**: `docker compose logs backend`; most often the database (check `mysql` health) or a missing
  variable (the API names it and stops).
- **Emails stuck**: check SMTP credentials and the provider; `FAILED` rows keep `last_error` (no message bodies are
  logged). Fix the cause; failed emails are not resent automatically.
- **Database lost or corrupted**: stop the stack, restore the latest good backup (section 3), start, check readiness.
- **Secret leaked**: rotate `JWT_SECRET` (signs everyone out), the database passwords, `METRICS_SCRAPE_TOKEN` or the
  provider key concerned, then redeploy.
