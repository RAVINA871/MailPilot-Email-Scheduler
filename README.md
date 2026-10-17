# MailPilot: Precision Scheduling. Reliable Delivery.

Email campaign scheduler. React + TypeScript + Tailwind frontend; Express + TypeScript backend; PostgreSQL (Prisma 7); Redis + BullMQ;
Nodemailer/Ethereal; Elasticsearch; Bull Board; Google OAuth; Slack OAuth. See `docs/ARCHITECTURE.md` and `docs/DEMO.md`.

## Prerequisites
Node 20+ (22 tested), Docker (PostgreSQL, Redis, Elasticsearch), internet access (npm, Prisma engines, Ethereal, Google, Slack).

## Setup
```bash
docker compose up -d                       # postgres :5432, redis :6379, elasticsearch :9200
cp .env.example backend/.env               # then fill in values (see "Credentials")
cd backend && npm install                  # also runs `prisma generate`
npx prisma migrate deploy                  # applies prisma/migrations/0001_init
cd ../frontend && npm install
```
Run (3 terminals):
```bash
cd backend && npm run dev                  # API  http://localhost:4000
cd backend && npm run worker               # BullMQ workers + outbox relay (run several to scale)
cd frontend && npm run dev                 # UI   http://localhost:5173 (proxies /api, /auth, /admin to the API)
```
Production-style: `cd frontend && npm run build`, then `cd backend && npm run build && npm start` (the API serves `frontend/dist`); run `npm run worker:start` separately. Health: `GET /health`.

## Credentials and callback URLs (taken from the code)
| Service | Where | Value |
|---|---|---|
| Google OAuth (Web app) | console.cloud.google.com, Credentials | Authorized redirect URI: `http://localhost:4000/auth/google/callback` (= `<BACKEND_URL>/auth/google/callback`) |
| Slack app | api.slack.com/apps, OAuth & Permissions | Redirect URL: `http://localhost:4000/api/integrations/slack/callback`; bot scope `chat:write` only |
| SMTP | leave `SMTP_USER/PASS` blank to auto-create an Ethereal account, or use https://ethereal.email/create | |
| Encryption key | `openssl rand -hex 32` into `TOKEN_ENCRYPTION_KEY` | |

Use `localhost` consistently (not 127.0.0.1) so the session cookie is shared by the UI (:5173) and API (:4000).
If Google/Slack credentials are missing, the UI shows a setup message instead of pretending.

## Tests
```bash
# needs Postgres + Redis and a test DB with the migration applied:
createdb mailpilot_test && psql mailpilot_test -f backend/prisma/migrations/0001_init/migration.sql
cd backend && npm run typecheck && npm test     # TEST_DATABASE_URL / TEST_REDIS_URL override defaults (Redis DB 15 is FLUSHED)
cd frontend && npm run build
```

## Test report (run in the build sandbox, 2026-10-17)
**Passed (executed):** backend `tsc` typecheck; frontend `tsc` + `vite build`; backend production build; **49 backend tests** against real PostgreSQL 16, Redis 7 and a local SMTP server:
CSV/TXT parsing; token encryption; campaign validation; API validation/errors; per-user data isolation; idempotency key; outbox to delayed BullMQ jobs with correct spacing; duplicate-scheduling prevention;
atomic limiter (30 concurrent acquisitions → exactly `limit`); hourly deferral and notifier invocation; retries then FAILED plus slot release; already-SENT never re-sent; worker stop/restart without duplicate sends;
Slack notifier (not connected, success, dedupe, API error, network error); Google/Slack OAuth redirect, denied and bad-state handling; logout and Origin check; Bull Board auth;
search query scoping and failure handling (**with a fake ES client**) plus a real "ES down gives 503" check.
Manual smoke run: API + worker + local SMTP + built frontend served by the API. A campaign was created, 2 of 3 emails sent with hourly limit 2, the 3rd stayed pending; /health and Bull Board responded.

**NOT verified (needs external services, credentials or network unavailable in the sandbox):**
real Google login; real Slack OAuth and messages; Ethereal account creation and preview links; Elasticsearch indexing/search against a real cluster;
`prisma migrate deploy` (the migration SQL is hand-written to match `schema.prisma` and was applied with psql; run `npx prisma migrate dev` once to confirm there is no drift);
Docker Compose; browser behaviour of the UI (built and typechecked, never clicked through); responsive layout (not visually checked); the Figma design (not accessible, UI uses my own design).
The restart test stops/starts a worker, not the Redis/Postgres processes.

## Known limitations
* No dev-login bypass: Google credentials are required to sign in.
* The rate limit is per campaign (clock-hour window). Deferred emails keep order via +position ms; strict ordering is not guaranteed with concurrency > 1.
* A single duplicate is possible if a worker crashes between SMTP acceptance and the DB write (inherent to SMTP).
* In the build sandbox the Prisma CLI could not download its schema engine, so `prisma generate` was run with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true`. A normal machine does not need this.
