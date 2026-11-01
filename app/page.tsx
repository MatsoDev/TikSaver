export const dynamic = "force-dynamic";

type Check = {
  name: string;
  ok: boolean;
  hint: string;
};

export default function Home() {
  const checks: Check[] = [
    {
      name: "Database",
      ok: Boolean(process.env.DATABASE_URL),
      hint: "DATABASE_URL",
    },
    {
      name: "Admin password",
      ok: Boolean(process.env.ADMIN_PASSWORD),
      hint: "ADMIN_PASSWORD",
    },
    {
      name: "Encryption key",
      ok: Boolean(process.env.ENCRYPTION_KEY),
      hint: "ENCRYPTION_KEY",
    },
    {
      name: "Cron secret",
      ok: Boolean(process.env.CRON_SECRET),
      hint: "CRON_SECRET",
    },
    {
      name: "GitHub dispatch",
      ok: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO),
      hint: "GITHUB_TOKEN + GITHUB_REPO",
    },
    {
      name: "Telegram",
      ok: Boolean(
        process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
      ),
      hint: "TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID",
    },
  ];

  const configured = checks.filter((check) => check.ok).length;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Personal streak saver
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Tiksave</h1>
          <p className="max-w-xl text-zinc-400">
            Sends a preset message to a chosen TikTok contact at a daily time,
            even when your device is off.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-medium">Configuration</h2>
            <span className="text-sm text-zinc-400">
              {configured} / {checks.length} ready
            </span>
          </div>
          <ul className="mt-5 divide-y divide-zinc-800">
            {checks.map((check) => (
              <li
                key={check.name}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{check.name}</span>
                  <code className="text-xs text-zinc-500">{check.hint}</code>
                </div>
                <span
                  className={
                    check.ok
                      ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400"
                      : "rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400"
                  }
                >
                  {check.ok ? "configured" : "missing"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Scheduler",
              body: "cron-job.org hits /api/tick every minute; Vercel decides what is due.",
            },
            {
              title: "Worker",
              body: "GitHub Actions runs a Playwright script that sends the message.",
            },
            {
              title: "Alerts",
              body: "Every run is logged and reported to you on Telegram.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <h3 className="text-sm font-medium">{card.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{card.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
