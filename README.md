# Tiksave

A single-user TikTok streak saver. Tiksave sends a preset message to one chosen
TikTok contact at a daily time you choose, even when your phone or laptop is off.

> Automated messaging may violate TikTok's terms of service. This project is for
> personal use, with your own account, and comes with no guarantees. TikTok can
> change its UI or invalidate your session at any time.

## How it works

1. **Vercel** hosts the Next.js 14 admin UI and API.
2. **cron-job.org** calls `GET /api/tick` once a minute with an
   `x-cron-secret` header.
3. `/api/tick` finds jobs that are due in their own timezone (plus a
   deterministic per-day jitter) and atomically claims them so a job can never
   send twice on the same local day.
4. The claimed job triggers the **GitHub Actions** workflow `send.yml` with the
   job id.
5. The workflow runs the **Playwright worker** in `/worker`. The worker fetches
   the job and decrypted cookies from `/api/worker/job/[id]`, opens TikTok
   messages, finds the conversation, types the message with human-like delays,
   sends it, and verifies it appears.
6. The worker posts the result to `/api/worker/result`, which writes a log and
   sends a **Telegram** notification. Failures are retried up to two times,
   ten minutes apart, through the tick endpoint.
7. Screenshots are saved on failure and shown in the logs page.

The scheduling device does not need to be online: the schedule lives in Neon,
the trigger lives in cron-job.org, and the browser lives in GitHub Actions.

## Stack

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| App        | Next.js 14 (App Router), TypeScript, Tailwind CSS    |
| Database   | Neon Postgres + `drizzle-orm` (`neon-http` driver)   |
| Worker     | Node + Playwright in `/worker`, GitHub Actions       |
| Scheduler  | cron-job.org -> `GET /api/tick`                      |
| Alerts     | Telegram Bot API                                     |

## Project layout

```
app/                 Next.js pages and API routes
  api/tick           cron entrypoint
  api/worker/job     job + cookies for the worker
  api/worker/result  worker result ingestion
  dashboard          jobs, logs and session UI
db/                  Drizzle schema and lazy Neon client
drizzle/             generated SQL migrations
lib/                 auth, crypto, GitHub, Telegram, time and job helpers
worker/              Playwright worker (separate npm project)
  selectors.ts       every TikTok selector in one place
.github/workflows/   send.yml worker workflow
```

## Setup

### 1. Create the Neon database

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string. It looks like
   `postgres://user:password@ep-...-pooler.region.aws.neon.tech/db?sslmode=require`.
3. Locally, create `.env.local` from `.env.example` and set `DATABASE_URL`.
4. Apply the migrations:

   ```bash
   npm install
   npm run db:migrate
   ```

   `npm run db:generate` creates new SQL migrations after schema changes.
   `npm run db:push` is a dev-only shortcut that skips migration files.

### 2. Deploy to Vercel and connect the GitHub repo

1. Push this repository to GitHub (it already lives at
   `https://github.com/MatsoDev/TikSaver`).
2. In Vercel, **Add New -> Project -> Import Git Repository**, choose the repo
   and the `main` branch. The framework preset is detected as Next.js.
3. Add the environment variables below for **Production** (and Preview if you
   want preview deployments to work).
4. Deploy. Vercel redeploys automatically on every push to `main` because the
   repo is connected to the project.
5. Run `npm run db:migrate` locally (with the production `DATABASE_URL`) to
   apply migrations. Vercel builds do not run migrations.

Vercel environment variables:

| Variable             | Value                                                        |
| -------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`       | Neon pooled connection string.                               |
| `ADMIN_PASSWORD`     | The password you will type on `/login`.                      |
| `ENCRYPTION_KEY`     | 32 random bytes, base64. Encrypts cookies and signs sessions. |
| `CRON_SECRET`        | A long random string. Also used by the worker.               |
| `GITHUB_TOKEN`       | Fine-grained token with `Actions: write` on this repo.       |
| `GITHUB_REPO`        | `MatsoDev/TikSaver`.                                         |
| `TELEGRAM_BOT_TOKEN` | From @BotFather.                                             |
| `TELEGRAM_CHAT_ID`   | Your chat id with the bot.                                   |

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The same `ENCRYPTION_KEY` is used for AES-256-GCM cookie encryption and for
signing the admin session cookie. Keep it stable: changing it logs you out and
makes stored cookies unreadable, so you must upload the TikTok cookies again.

### 3. Create the GitHub token

1. GitHub **Settings -> Developer settings -> Personal access tokens ->
   Fine-grained tokens -> Generate new token**.
2. Repository access: only `MatsoDev/TikSaver`.
3. Repository permissions: **Actions: Read and write** (needed to dispatch the
   workflow), **Contents: Read** (metadata), **Metadata: Read** (mandatory).
4. Copy the token into Vercel as `GITHUB_TOKEN`. Never commit it.

Make sure Actions are enabled for the repository. The workflow
`.github/workflows/send.yml` accepts a `job_id` input.

### 4. Add GitHub Actions secrets

In the GitHub repo: **Settings -> Secrets and variables -> Actions -> New
repository secret**:

| Secret        | Value                                                     |
| ------------- | --------------------------------------------------------- |
| `APP_URL`     | Your deployment URL, for example `https://tiksave.vercel.app`. |
| `CRON_SECRET` | Exactly the same value as the Vercel `CRON_SECRET`.        |

The worker uses these to call the protected job and result endpoints. The
workflow does not need `DATABASE_URL` or any TikTok credentials; cookies are
fetched from the app at run time.

### 5. Set up cron-job.org

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Create a cron job:
   - URL: `https://<your-app>.vercel.app/api/tick`
   - Schedule: every 1 minute.
   - Enable **Custom headers** and add `x-cron-secret` with the value of
     `CRON_SECRET`.
   - Method: `GET`.
3. Save and run it once manually. A `200` with JSON like
   `{"ok":true,"checked":0,"dispatched":0,"failed":0}` means it works.

If the secret is wrong the endpoint returns `401`; if `CRON_SECRET` is missing
on the server it returns `500`.

### 6. Create the Telegram bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, pick a
   name and a username. Copy the token into `TELEGRAM_BOT_TOKEN`.
2. Open your new bot and press **Start**, or send it any message.
3. Find your chat id by opening
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and reading
   `result[0].message.chat.id`. Put it in `TELEGRAM_CHAT_ID`.
4. For a group, add the bot to the group, send a message, and use the negative
   group id from `getUpdates`.

Notifications contain the job id, the target username and a generic status
detail. They never contain cookies or message contents.

### 7. Export TikTok cookies

1. Log in to [tiktok.com](https://www.tiktok.com) in a desktop browser.
2. Install a cookie export extension, for example **Cookie-Editor** or
   **EditThisCookie**.
3. On `tiktok.com`, open the extension and export/ copy the cookies as JSON.
   The result must be an array of objects with `name`, `value`, `domain`, and
   optionally `path`, `expires`, `httpOnly`, `secure`, `sameSite`.
4. In Tiksave open **Session**, paste the JSON and save. Only the cookies array
   is kept, encrypted with AES-256-GCM.
5. A Playwright storage state file (`{"cookies":[...],"origins":[...]}`) is also
   accepted.

Sessions expire. When Telegram reports **session expired**, export fresh
cookies and save them again. TikTok may also show a captcha; the worker treats
that as `session_expired` and does not retry.

## Using Tiksave

1. Open `/login` and enter `ADMIN_PASSWORD`.
2. Create a job: username (without `@`), message, send time in `HH:MM`, IANA
   timezone (default `Africa/Cairo`) and jitter in minutes.
3. Use **Send now** to test the whole pipeline without waiting for the schedule.
4. Watch **Logs** for statuses and failure screenshots.

### Sending rules

- A job sends when the local time in its timezone is at or after
  `send_time + jitter`.
- Jitter is deterministic per job per local date, so retries of `/api/tick`
  within the same minute cannot change the target time.
- `last_run_date` is set atomically with an `UPDATE ... WHERE` before dispatch,
  which makes the tick idempotent even if cron calls it concurrently.
- A failed worker run schedules up to **2 retries, 10 minutes apart**. Retries
  are claimed atomically by the same tick endpoint. `session_expired` is never
  retried.
- A GitHub dispatch failure is logged and is not retried automatically. Use
  **Send now** after fixing `GITHUB_TOKEN` / `GITHUB_REPO`.
- Disabling a job stops both scheduled sends and pending retries.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
cd worker && npm install && npm run typecheck
```

Test the tick endpoint locally:

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/tick
```

Run the worker locally (requires a public app URL reachable from your machine):

```powershell
cd worker
$env:JOB_ID="<job uuid>"
$env:APP_URL="https://your-app.vercel.app"
$env:CRON_SECRET="..."
npm run start
```

## Security and privacy

- The admin session is an HMAC-signed, `httpOnly`, `SameSite=Lax` cookie with a
  30-day expiry. Middleware protects `/dashboard` and all `/api/*` routes except
  `/api/tick`, `/api/worker/*` and `/api/auth/login`.
- `/api/tick` and `/api/worker/*` authenticate with `x-cron-secret`, compared in
  constant time.
- TikTok cookies are encrypted at rest with AES-256-GCM. The encryption key never
  leaves the server environment.
- Cookies and message contents are never logged. Logs store only job ids,
  statuses, generic details and optional screenshots. Telegram messages do not
  include message contents.
- `.env`, `.env.*` (except `.env.example`), cookie files and screenshots are
  gitignored.

## Troubleshooting

| Symptom                             | Likely fix                                                        |
| ----------------------------------- | ----------------------------------------------------------------- |
| `/api/tick` returns `401`           | `x-cron-secret` does not match `CRON_SECRET`.                     |
| `/api/tick` returns `500`           | `CRON_SECRET` is not set in Vercel.                               |
| Jobs never dispatch                 | `GITHUB_TOKEN` lacks `Actions: write`, or `GITHUB_REPO` is wrong. |
| Workflow starts but the worker fails | `APP_URL` or `CRON_SECRET` GitHub secrets are wrong.              |
| `session_expired`                   | Re-export TikTok cookies and save them in **Session**.            |
| Message sent but unverified         | TikTok changed its DOM; update `worker/selectors.ts`.              |
| No Telegram messages                | Bot token/chat id are wrong, or you never messaged the bot first. |

## Decisions

- **Next.js pinned to 14.2.35**, the latest patched 14.x release.
- **Neon HTTP driver** so the same database client works on Vercel and from the
  worker's Node process without connection pooling issues.
- **Lazy database initialization** keeps builds working without secrets.
- **HMAC-signed stateless session cookie** avoids an extra session table for a
  single-user app.
- **`send_time` as `HH:MM` text** plus an explicit IANA timezone keeps the
  user's wall-clock intent clear.
- **Deterministic jitter** prevents double sends while still avoiding an
  exact-time pattern.
- **Atomic claim via `UPDATE ... WHERE ... RETURNING`** is the idempotency
  primitive; no long transactions are held while GitHub is called.
- **Retry state on `jobs`** (`retry_count`, `next_retry_at`) keeps retries
  visible to the tick endpoint without an extra queue table.
- **Screenshots stored as base64 data URLs** in `logs.screenshot_url` (max
  ~1.5 MB) and served through `/api/logs/[id]/screenshot`. This avoids adding a
  blob-storage provider for a single-user app. The worker also writes local
  copies to `worker/screenshots`, uploaded as a GitHub Actions artifact.
- **Selectors isolated in `worker/selectors.ts`** so TikTok UI changes are a
  one-file fix.

## Project status

- Step 1 - scaffold, Tailwind, Drizzle schema and initial migration.
- Step 2 - password auth, signed cookie, middleware, AES-256-GCM helpers.
- Step 3 - dashboard, job CRUD, encrypted session upload, logs.
- Step 4 - idempotent `/api/tick` with timezone-aware jitter.
- Step 5 - Playwright worker, protected worker endpoints, Actions workflow.
- Step 6 - Telegram notifications and tick-driven retries.
- Step 7 - documentation.
