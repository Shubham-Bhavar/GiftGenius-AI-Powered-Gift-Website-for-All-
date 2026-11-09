# Order email notifications

Phase 2 of the premium roadmap: real transactional email for orders. This document covers Stage 2.1, reliable
delivery. Branded HTML templates and the owner's new-order email (Stage 2.2) and end-to-end delivery tests with a test
mail server (Stage 2.3) are not built yet.

## What is sent

Every order email goes through the email outbox:

| Kind | To | When | Dedupe key |
|---|---|---|---|
| `ORDER_CONFIRMED` | customer | order confirmed: cash on delivery or nothing to pay at checkout, or online payment received (browser or webhook, whichever is first) | `order:<id>:confirmed:customer` |
| `ORDER_NEW_FOR_SELLER` | each seller with lines in the order | with the confirmation | `order:<id>:confirmed:seller:<sellerUserId>` |
| `ORDER_STATUS` | customer | shipped, out for delivery, delivered, cancelled (by the customer or the store) | `order:<id>:status:<STATUS>:customer` |
| `ORDER_PART_SHIPPED` | customer | a seller shipped or delivered their part | `order:<id>:seller:<sellerUserId>:<STEP>:customer` |

The wording is unchanged from before Stage 2.1 (plain text). Seller emails list only that seller's lines and never the
customer's name, email, phone or address; sellers see delivery details in Seller Center, behind their login.

Account, seller-application, product-review and contact-form emails still go through `Mailer` as before. Password-reset
links stay there on purpose, so a one-time link is never stored in the database.

## How delivery works

1. **Queued with the order.** `OrderNotifier` calls `EmailOutbox.enqueue` inside the transaction that confirms the order
   or changes its status. The row is saved with the order, or not at all, and survives a restart.
2. **Queued once.** `email_outbox.dedupe_key` is unique. Queueing the same key again (the same event handled twice,
   twice at once, or on two servers) changes nothing: `INSERT ... ON DUPLICATE KEY UPDATE`, no error.
3. **Never fails the order.** Queueing runs through JDBC, so a failed insert rolls back that statement only and does not
   mark the order's transaction for rollback; any database error is caught, logged and counted. Building an email's
   text is guarded too: an error there is logged with the order number, counted as a `content` failure and skipped,
   and the order goes ahead. (The seller lookup is a database query; a database error there still fails the
   transaction, as any database error would.) Delivery happens later, outside the order's transaction.
4. **Delivered in the background.** `EmailOutboxSender` is woken when a queueing transaction commits, and also polls
   every 15 seconds (`MAIL_OUTBOX_POLL_INTERVAL`). Each pass claims due emails one at a time with
   `SELECT ... FOR UPDATE SKIP LOCKED` and commits the claim (`SENDING`, with a 5-minute lease) before sending, so
   senders on several servers each take different emails.
5. **Sent means accepted.** An email becomes `SENT` only after the SMTP server accepts it.
6. **Bounded retries.** A failure is retried after 1 min, 5 min, 15 min and 1 h, so at most 5 attempts, then `FAILED`.
   An error that retrying can't fix (a malformed or refused address) fails at once. Authentication failures are retried,
   since fixing the settings fixes them.
7. **No provider, no pretending.** Without `SMTP_HOST` nothing is sent and the email is recorded as `NOT_SENT`.
8. **Interrupted deliveries aren't repeated.** See the delivery guarantee below.
9. **One Message-ID per email.** Every attempt at an email carries the same Message-ID,
   `<gg-outbox.<row id>.<first 16 hex of SHA-256(dedupe key)>@<MAIL_FROM's domain>>`. The hash names the order, event
   and recipient without revealing them.
10. **Safe records.** Logs mask the recipient (`a***@example.com`); stored errors are the exception type and message with
   addresses masked, on one line, at most 500 characters. Message bodies are never logged.

All outbox times come from the database clock (`UTC_TIMESTAMP(6)`), so servers agree on what is due.

## Delivery guarantee

**Not exactly-once.** SMTP gives no way to confirm that a message was accepted exactly once, so nothing here claims it.
What does hold:

| Situation | Outcome | Record |
|---|---|---|
| Server accepts it | delivered once | `SENT` |
| Server refuses it, or the connection fails before it's handed over | retried (bounded), then given up | `PENDING`, then `SENT` or `FAILED` |
| **Server accepts it, then the app crashes or loses its database before recording `SENT`** | delivered once, never resent | stays `SENDING` until the 5-minute lease runs out, then `FAILED` with "interrupted" |
| App crashes after claiming it but before handing it over | not delivered, never resent | the same as the row above: the two can't be told apart |
| **A timeout waiting for the server's reply after it accepted the message** | **retried, so delivered twice** | `SENT` after the retry |
| A send outlives its lease, another server marks it interrupted, then the send succeeds | delivered once | `SENT` (the success overwrites "interrupted") |
| No `SMTP_HOST` | not delivered | `NOT_SENT` |

The trade-off: after a crash the outcome is unknown, and the outbox chooses a possible **missing** email over a possible
**duplicate**, because two confirmations of one order look like two orders and alarm customers, while a missing one is
recoverable (the order page and tracking work regardless, and the record says `FAILED`). The record errs towards
"failed", never towards "sent".

The one way to get a duplicate is the reply timeout: the client can't tell whether the server took the message, and it
retries rather than lose an email to a slow server. Every attempt carries the same Message-ID, so many mailbox
providers (Gmail, for example) show the copies as one message, but that is the provider's choice, not a guarantee.

Tested: `EmailOutboxIT.anEmailTheServerAcceptedButThatWasNeverRecordedAsSentIsRecordedAsFailedAndNotResent` (the server
accepts, recording `SENT` fails, the lease runs out: one delivery, `FAILED`, no `sent_at`),
`aSendThatOutlivesItsLeaseIsStillRecordedAsSentWhenItSucceeds`, and the Message-ID tests in `EmailOutboxSenderTest`
(including through Spring's real `JavaMailSenderImpl`, which keeps an explicit Message-ID) and `EmailOutboxIT`.

## Monitoring and reconciliation

Read-only, on the management port's Prometheus endpoint (`/actuator/prometheus`, port `MANAGEMENT_PORT`, 9091 by
default, not the public API), which needs `Authorization: Bearer <METRICS_SCRAPE_TOKEN>` and refuses everyone when
no token is set. `EmailOutboxMonitor` refreshes the values every 5 minutes, so a scrape never queries the
database; a refresh that fails keeps the last values and logs a warning. No meter carries a recipient, order number or
content.

| Meter (Prometheus name) | Meaning | Suggested alert |
|---|---|---|
| `giftgenius_email_queue_failures_total{reason}` | emails that couldn't be queued: `database`, `content`, `no_recipient`, `invalid_key` | any increase |
| `giftgenius_email_outbox_emails{status}` | emails by status | `FAILED` increases |
| `giftgenius_email_outbox_oldest_pending_age_seconds` | how long the oldest waiting email has been queued | above 5,400 (90 min: longer than the whole retry schedule) |
| `giftgenius_email_outbox_oldest_overdue_seconds` | how far past its due time the most overdue waiting email is; grows only when nothing is sending | above 900 (15 min) |
| `giftgenius_email_confirmations_missing` | orders confirmed since V7 was installed with no confirmation email queued | above 0 |

Keep these out of the health check: a mail problem must never get the application restarted or taken out of traffic.

**Reconciliation.** The same refresh finds orders that reached `CONFIRMED` after V7 was installed (Flyway's install time)
and have no `ORDER_CONFIRMED` row, sets `giftgenius_email_confirmations_missing`, and logs a warning with up to 20
order numbers (order numbers only). It changes nothing and resends nothing. To look by hand:

```sql
SELECT o.order_number, ev.created_at AS confirmed_at
FROM orders o
JOIN order_status_events ev ON ev.order_id = o.id AND ev.status = 'CONFIRMED'
LEFT JOIN email_outbox e ON e.order_id = o.id AND e.kind = 'ORDER_CONFIRMED'
WHERE e.id IS NULL
  AND ev.created_at >= (SELECT TIMESTAMPADD(SECOND, -TIMESTAMPDIFF(SECOND, installed_on, NOW()), UTC_TIMESTAMP())
                        FROM flyway_schema_history WHERE version = '7' AND success = 1)
ORDER BY ev.created_at;
```

**Recovery** is a person's decision, not automatic. Today: contact the customer (the order page and tracking link work).
A future admin action could re-queue the confirmation under its usual dedupe key, which can never create a second copy;
it needs approval first. Re-queuing an email recorded as "interrupted" may deliver it twice, since it may have arrived.

## Before deploying (open blockers)

Found in the deployment-readiness check of 2026-11-09.

- **Management port exposure: secured (committed locally, not pushed).** Actuator now has its own security chain
  (`ManagementSecurityConfig`): only the liveness and readiness probes are open (status only); metrics and the overall
  health need `METRICS_SCRAPE_TOKEN` as a bearer token and are refused when it isn't set; everything else is closed.
  This holds wherever Actuator is served, including if `MANAGEMENT_PORT` is set equal to `PORT`. The port still
  listens on every interface by default. Still for the owner on the chosen host: set `METRICS_SCRAPE_TOKEN` if metrics
  are scraped; keep 9091 unpublished (it isn't in the Docker Compose setup); optionally set
  `MANAGEMENT_SERVER_ADDRESS=127.0.0.1` where nothing scrapes from another container. **Not yet verified:** the Docker
  image's own health check in a running container; the readiness request it makes is tested over HTTP only.
- **MySQL version.** The claim query needs MySQL 8.0.1 or later with InnoDB (`FOR UPDATE SKIP LOCKED`), and the `CHECK`
  constraints of V1 and V5 are enforced only from 8.0.16, so the minimum is 8.0.16. Tested on 8.0.43; CI is set up for
  8.4 but hasn't run this branch. Still needed: `SELECT VERSION(), @@version_comment;` on the production (or restored)
  database, `orders` using InnoDB (V7 adds a foreign key to it), the application user allowed to create tables,
  indexes and foreign keys, and the integration tests run on the production version.
- **Real SMTP** delivery is untested until Stage 2.3.

## Retention (recommendation; not implemented)

Rows hold the recipient's address and the email text (today: first name, items, total, tracking link; Stage 2.2 adds
the delivery address). Recommended, once approved:

- `SENT` and `NOT_SENT`: keep in full for 30 days, for support; then blank `body_text`, mask `recipient`, and keep the
  rest (kind, status, attempts, times, order id) as long as the order itself is kept.
- `FAILED`: keep in full for 90 days, to investigate; then blank the same way.
- `PENDING` and `SENDING`: never touched.
- A customer's erasure request: blank their rows at once.
- Backups hold the same data; confirm the periods against your legal and privacy obligations.

Nothing deletes or blanks rows today.

## The table (migration V7)

`V7__email_outbox.sql` adds one table and touches nothing else: no existing table, column or row changes, so it is
backward-compatible with the running application and its data. Columns: `dedupe_key` (unique), `kind`, `order_id`
(foreign key to `orders`, nullable), `recipient`, `subject`, `body_text`, `status`, `attempts`, `next_attempt_at`,
`locked_until`, `last_error`, `sent_at`, `created_at`, `updated_at`; indexed on `(status, next_attempt_at)` for the
sender and on `order_id`.

Rows are kept: they are the delivery record. There is no clean-up job yet.

## Settings

| Variable | Default | |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS` | none, 587 | any SMTP provider; without a host nothing is sent |
| `MAIL_FROM` | `GiftGenius <no-reply@giftgenius.local>` | sender address |
| `MAIL_OUTBOX_SENDER_ENABLED` | `true` | whether this instance delivers queued emails (they are queued either way) |
| `MAIL_OUTBOX_POLL_INTERVAL` | `15s` | how often to look for due emails and retries |

The lease (5 min), batch size (20) and retry delays are in `application.yml` under `app.mail.outbox`.

## Code

- `notify/EmailOutbox.java`: queueing.
- `notify/EmailOutboxStore.java`: claiming and recording outcomes.
- `notify/EmailOutboxSender.java`: delivery, retries, Message-ID, error classification and masking.
- `notify/EmailOutboxMonitor.java`: metrics and reconciliation (read-only).
- `notify/EmailKind.java`; `order/service/OrderNotifier.java` (now queues instead of sending).
- Tests: `EmailOutboxSenderTest`, `EmailOutboxTest`, `OrderNotifierTest` and `ProductionOutboxConfigTest` (unit; the
  last pins the production retry schedule, and every other test reads it from `application.yml`); `EmailOutboxIT` and
  `OrderEmailIsolationIT` (MySQL), plus queue checks in `PaymentIT` (browser and webhook confirming at once) and
  `SellerMarketplaceIT` (split orders, seller privacy).
