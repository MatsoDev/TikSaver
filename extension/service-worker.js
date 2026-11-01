importScripts("config.local.js");

const SYNC_ALARM = "tiksave-cookie-sync";
let lastSent = 0;

function setBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? "OK" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#16a34a" : "#dc2626" });
}

async function syncCookies() {
  const cookies = await chrome.cookies.getAll({ domain: "tiktok.com" });
  if (!cookies.some((cookie) => cookie.name === "sessionid")) return;
  if (Date.now() - lastSent < 10 * 60 * 1000) return;
  const response = await fetch(`${TIKSAVE_APP_URL}/api/session/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-extension-token": EXTENSION_TOKEN },
    body: JSON.stringify({ cookies: cookies.map(({ name, value, domain, path, expirationDate, httpOnly, secure, sameSite }) => ({
      name, value, domain, path, expires: expirationDate, httpOnly, secure, sameSite,
    })) }),
  });
  if (!response.ok) throw new Error(`sync ${response.status}`);
  lastSent = Date.now();
  setBadge(true);
}

function runSync() { syncCookies().catch(() => setBadge(false)); }
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 }); runSync(); });
chrome.runtime.onStartup.addListener(runSync);
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === SYNC_ALARM) runSync(); });
chrome.cookies.onChanged.addListener((change) => { if (change.cookie.domain.endsWith("tiktok.com")) runSync(); });
