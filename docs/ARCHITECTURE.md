# Architecture

Browser → React (Vite) → Express API (cookie session) → PostgreSQL (source of truth)
Redis/BullMQ ← Worker(s) → SMTP (Ethereal) / Slack API / Elasticsearch

* **Transactional outbox**: `POST /api/campaigns` writes Campaign + Recipients + OutboxEvent rows in ONE DB transaction.
  The worker's relay (every 2 s) publishes unpublished outbox rows to BullMQ with `jobId = recipientId` and `delay = sendAt - now`.
  If the relay crashes after `queue.add` but before marking the row, the retry is a no-op (same jobId): no duplicate job.
* **Spacing**: recipient *i* is scheduled at `startAt + i × delay`.
* **Hourly limit**: atomic Redis Lua script (INCR + rollback) per campaign per clock hour. Over the limit, the job is moved
  to the next hour (`moveToDelayed`, +position ms to preserve order) and a deduplicated Slack alert is sent (once per campaign per hour).
* **Idempotency**: jobs skip recipients already `SENT`; unique (campaignId,email); unique outbox row per recipient; optional `Idempotency-Key` header on campaign creation.
* **Retries**: BullMQ exponential backoff (EMAIL_ATTEMPTS / EMAIL_BACKOFF_MS); final failure → `FAILED`; every attempt stored in DeliveryAttempt; the rate-limit slot is released after a failed send.
* **Limitation**: SMTP has no exactly-once guarantee. If a worker crashes after the SMTP server accepted a message but before the DB write, the retry may send that one message again.
* **Search**: after each status change an `indexing` job (8 retries, backoff) re-indexes the recipient into Elasticsearch. Every query is filtered by `userId`. ES outage → search returns 503 with a friendly message; indexing keeps retrying.
* **Auth**: Google OAuth code flow (state cookie), opaque random session token in an HttpOnly SameSite=Lax cookie; only its SHA-256 is stored. State-changing requests are Origin-checked.
* **Slack**: OAuth v2 (`chat:write`), bot token AES-256-GCM encrypted at rest, alert sent as a DM to the user who installed the app.
* **Bull Board**: `/admin/queues`, login required, read-only; admin emails only in production. Job payloads contain only recipient IDs.
