# Tiksave

Tiksave is a private, single-user app for scheduling a daily TikTok direct message to a chosen contact. It includes an admin dashboard, an encrypted TikTok session store, a Windows PC worker, and Telegram status alerts.

> Use only with an account and contacts you are authorized to message. TikTok may change its interface, expire sessions, or restrict automated activity.

## Production overview

- **Web app:** Next.js dashboard and API deployed on Vercel.
- **Database:** Neon Postgres, accessed with Drizzle ORM.
- **Local sender:** a Windows Scheduled Task runs Playwright on the user's PC. Chrome does not need to be open for a send; the worker uses the encrypted session stored by Tiksave.
- **Session refresh:** the unpacked Chrome extension periodically visits TikTok Messages in a background tab, then syncs the current TikTok cookies to the app. It also syncs after TikTok cookie changes.
- **Scheduler and fallback alerts:** cron-job.org calls `/api/tick` every minute. With `EXECUTOR=local`, scheduled sends stay on the PC while the API continues checking reminder deadlines.
- **Notifications:** Telegram reports run status and can alert when the browser session is logged out.

The production app is [tiksaver-six.vercel.app](https://tiksaver-six.vercel.app). Keep all credentials in local ignored configuration or the relevant service's secret store.

## Daily send behavior

With `EXECUTOR=local` and the default `SEND_MODE`, the PC worker claims enabled jobs that have not been sent on the current date in each job's timezone. It does not wait for `send_time` to send. The configured send time remains useful as the reference for unsent-job reminders. A job is claimed atomically, so overlapping task runs do not send it twice for the same local date. **Send now** queues that job for the PC and is eligible immediately.

When the PC is off, scheduled jobs wait. Turn on the PC and sign in to Windows; the Scheduled Task runs at logon and repeats every five minutes while the user session is active. The task does not wake or power on the PC. A missed send can produce a Telegram reminder while the PC is off.

## Repository map

```text
app/                    Next.js pages, dashboard and API routes
  api/tick/             cron entry point and reminder checks
  api/worker/claim/     local worker queue claim endpoint
  api/worker/job/       protected job and session retrieval
  api/worker/result/    worker result and run log ingestion
  api/session/          encrypted cookie ingestion and session status
  dashboard/            jobs, logs and session pages
db/                     Drizzle schema and database client
drizzle/                SQL migrations and migration metadata
extension/              Manifest V3 Tiksave cookie sync extension
worker/                 Playwright sender and Windows local runner
  selectors.ts          TikTok UI selectors
  run-local.ps1         claims and runs jobs on this PC
.github/workflows/      optional GitHub Actions worker workflow
```

## Configuration

### Vercel production variables

Set secrets in Vercel Project Settings → Environment Variables. Do not put real values in this document or commit them.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled Postgres connection string. |
| `ADMIN_PASSWORD` | Password for the dashboard. |
| `ENCRYPTION_KEY` | Base64-encoded 32-byte key used to encrypt stored TikTok cookies. Keep it stable. |
| `CRON_SECRET` | Shared secret for cron and worker API authentication. |
| `EXECUTOR` | Set to `local` to keep scheduled sends on the PC. |
| `SEND_MODE` | Optional; `on_pc_start` sends each enabled job once per local date when claimed. With local execution this is the default. |
| `GITHUB_TOKEN`, `GITHUB_REPO` | Optional GitHub dispatch configuration for the Actions executor. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram delivery configuration. |
| `EXTENSION_TOKEN` | Secret used by the browser extension to authenticate session sync. |

The production cron request is `GET https://tiksaver-six.vercel.app/api/tick` with header `x-cron-secret` set to the same `CRON_SECRET`. Configure cron-job.org to call it every minute. `/api/tick` continues reminder checks when local execution is enabled.

### Local app development

1. Install Node.js 24 and clone the repository.
2. Copy `.env.example` to `.env.local` and fill in development values. Keep `.env.local` private.
3. Install dependencies and migrate the database:

   ```powershell
   npm install
   npm run db:migrate
   npm run dev
   ```

4. The browser worker has its own package manifest under `worker/`; install its dependencies there when developing the worker.

For production schema changes, create a Drizzle migration, review it, and apply it to the intended Neon database before relying on the new schema. Vercel builds do not automatically apply migrations.

## Windows PC executor

The supported local runner is `worker/run-local.ps1`. It reads `CRON_SECRET` from the repository `.env.local`, uses the configured production app URL, claims eligible jobs from `/api/worker/claim`, and launches the worker sequentially. The local log is `worker/logs/local.log`; it records execution markers and statuses, not message contents, cookies, or credentials. Treat logs and screenshots as private operational data.

The Scheduled Task is named **Tiksave** and is intended to run as the current Windows user, at sign-in and on a five-minute repeat while that session is active. It does not use a startup trigger or wake the PC.

Useful PowerShell commands:

```powershell
Start-ScheduledTask -TaskName Tiksave
Get-ScheduledTask -TaskName Tiksave
Get-ScheduledTaskInfo -TaskName Tiksave
Disable-ScheduledTask -TaskName Tiksave
Enable-ScheduledTask -TaskName Tiksave
```

To change a job's timezone or reminder reference time, edit that job in the dashboard. In `on_pc_start` mode, the send time does not delay the local send; the local date, enabled state, retry state, and manual queue determine eligibility.

## Chrome extension: automatic session refresh

The extension is a Manifest V3 unpacked extension; it is not distributed through a store.

1. Ensure the local-only `extension/config.local.js` exists and points to the production app with the extension token. This file is gitignored; never commit or share it.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository's `extension` folder.
3. Leave Chrome running. The extension schedules a background visit after install/reload, on Chrome startup, and every four hours. If a TikTok tab is already open, it syncs cookies without opening another tab. Visits are limited by a three-hour cooldown.
4. Cookie changes also trigger a debounced sync, and a periodic sync runs every 30 minutes. A successful sync updates the extension badge and the dashboard Session page.
5. If TikTok redirects the background tab to `/login` or the session cookie is absent, the extension does not upload cookies. It marks the session logged out and the app sends at most one Telegram alert per 12 hours.

The Session page shows the last extension sync, last background visit, and the session source. If a session is logged out, sign in to TikTok in Chrome; the extension will detect the updated cookies and sync them. The user does not need to open TikTok solely to keep the session refreshed.

After pulling an extension code update, open `chrome://extensions` and click **Reload** on Tiksave. Do not paste cookies into chat, source files, or Git.

## Dashboard workflow

1. Sign in at `/login` using `ADMIN_PASSWORD`.
2. On Jobs, configure a target username, message, timezone, reminder time, and whether the job is enabled.
3. Use **Send now** to queue a manual run. With local execution, the dashboard indicates that the job is queued for the PC.
4. Check Logs for the worker result and Telegram status. A success is recorded only after the worker reports a verified send.
5. Check Session to review the latest cookie sync and background visit.

## GitHub Actions executor (optional)

The repository retains `.github/workflows/send.yml` for deployments that use GitHub Actions as the worker. The local executor is the production configuration described above. To use GitHub dispatch instead, configure the GitHub token/repository variables and the workflow's `APP_URL` and `CRON_SECRET` secrets, and remove the local executor setting. Do not enable two schedulers for the same jobs without understanding the shared claim semantics.

## Security and operational notes

- TikTok cookies are encrypted at rest with AES-256-GCM. The encryption key must remain stable; replacing it makes existing encrypted cookies unreadable.
- Worker and extension endpoints authenticate with dedicated secrets. The extension token is separate from the cron secret.
- Never commit `.env.local`, `extension/config.local.js`, browser cookie exports, screenshots, local worker logs, or service tokens.
- Run logs should contain status and sanitized diagnostics only. Never add cookie values, credentials, or message text to logs.
- Keep the PC account and Chrome profile private. Anyone who can access the Windows profile may be able to run the local worker or inspect the active browser session.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dashboard says server is not configured | Confirm required Production variables exist in Vercel and redeploy after changing them. |
| `/api/tick` returns `401` | Verify cron-job.org's `x-cron-secret` matches Vercel `CRON_SECRET`. |
| Local task claims no jobs | Check enabled state, last run date in the job timezone, retry timing, queued manual run, and `worker/logs/local.log`. |
| No local run appears | Confirm the Tiksave Scheduled Task is enabled and the Windows user is signed in. |
| Extension badge shows an error | Check `extension/config.local.js`, reload the extension, and inspect its service-worker console without copying secrets into logs. |
| Session is logged out | Sign in to TikTok in Chrome and allow the extension to sync; inspect the Session page afterward. |
| Worker cannot find a conversation | The account must have an existing conversation with that username; inspect the sanitized failure details and screenshot. |
| Telegram alert is missing | Confirm the bot token/chat id in Vercel and start a conversation with the bot. Review the run's Telegram delivery status. |

## Development checks

```powershell
npm run typecheck
npm run lint
npm run build
Push-Location worker
npm run typecheck
Pop-Location
node --check extension/service-worker.js
```

Run checks relevant to a change before committing. Do not run production sends as a code test.
