importScripts("config.local.js");

const SYNC_ALARM = "tiksave-cookie-sync";
const VISIT_ALARM = "tiksave-background-visit";
const VISIT_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const SYNC_DEBOUNCE_MS = 10 * 60 * 1000;
let syncPromise = null;
let visitPromise = null;
let backgroundVisitInProgress = false;

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "never";
}

async function setBadge(ok, reason = "ok", { markSync = true } = {}) {
  const stored = await chrome.storage.local.get([
    "lastSyncAt",
    "lastSuccessfulSyncAt",
    "lastBackgroundVisitAt",
  ]);
  const now = Date.now();
  const lastSyncAt = markSync ? now : (stored.lastSyncAt ?? null);
  const lastSuccessfulSyncAt = ok ? now : (stored.lastSuccessfulSyncAt ?? null);
  await chrome.storage.local.set({
    lastSync: { status: ok ? "ok" : "error", reason, at: lastSyncAt },
    lastSyncAt,
    lastSuccessfulSyncAt,
  });
  await chrome.action.setBadgeText({ text: ok ? "OK" : "!" });
  await chrome.action.setBadgeBackgroundColor({ color: ok ? "#16a34a" : "#dc2626" });
  const fresh = await chrome.storage.local.get("lastBackgroundVisitAt");
  const state = ok ? "OK" : reason;
  await chrome.action.setTitle({
    title: `Tiksave: ${state} | Last sync: ${formatTime(lastSuccessfulSyncAt)} | Last background visit: ${formatTime(fresh.lastBackgroundVisitAt)}`,
  });
}

function isTikTokTab(tab) {
  try {
    const host = new URL(tab.url).hostname.toLowerCase();
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

function waitForTabComplete(tabId, initialTab) {
  if (initialTab.status === "complete") return Promise.resolve(initialTab);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, tab) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve(tab);
    };
    const listener = (updatedId, changeInfo, tab) => {
      if (updatedId === tabId && changeInfo.status === "complete") finish(null, tab);
    };
    const timer = setTimeout(() => finish(new Error("background_visit_timeout")), 60_000);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(null, tab);
    }).catch((error) => finish(error));
  });
}

async function postLoggedOut(visitedAt) {
  const response = await fetch(`${TIKSAVE_APP_URL}/api/session/ingest-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-extension-token": EXTENSION_TOKEN },
    body: JSON.stringify({ status: "logged_out", backgroundVisitAt: new Date(visitedAt).toISOString() }),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
}

async function syncCookies({ backgroundVisitAt } = {}) {
  const cookies = await chrome.cookies.getAll({ domain: "tiktok.com" });
  const hasSession = cookies.some((cookie) => cookie.name === "sessionid");
  if (!hasSession) {
    const state = await chrome.storage.local.get("sessionStatus");
    await setBadge(false, state.sessionStatus === "logged_out" ? "logged_out" : "no_sessionid");
    return false;
  }

  const stored = await chrome.storage.local.get("lastSyncAttemptAt");
  const now = Date.now();
  if (now - (stored.lastSyncAttemptAt ?? 0) < SYNC_DEBOUNCE_MS) return false;
  await chrome.storage.local.set({ lastSyncAttemptAt: now });

  const storedVisit = await chrome.storage.local.get("lastBackgroundVisitAt");
  const visitAt = backgroundVisitAt ?? storedVisit.lastBackgroundVisitAt;
  const response = await fetch(`${TIKSAVE_APP_URL}/api/session/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-extension-token": EXTENSION_TOKEN },
    body: JSON.stringify({
      cookies: cookies.map(({ name, value, domain, path, expirationDate, httpOnly, secure, sameSite }) => ({
        name, value, domain, path, expires: expirationDate, httpOnly, secure, sameSite,
      })),
      ...(visitAt ? { backgroundVisitAt: new Date(visitAt).toISOString() } : {}),
    }),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  await chrome.storage.local.set({ sessionStatus: "active" });
  await setBadge(true);
  return true;
}

function runSync(options = {}) {
  if (backgroundVisitInProgress) return Promise.resolve(false);
  if (syncPromise) return syncPromise;
  syncPromise = syncCookies(options).catch(async (error) => {
    const reason = error?.message === "Failed to fetch" ? "network" : String(error?.message ?? "sync_failed");
    await setBadge(false, reason.slice(0, 80));
    return false;
  }).finally(() => { syncPromise = null; });
  return syncPromise;
}

function backgroundVisit() {
  if (visitPromise) return visitPromise;
  visitPromise = (async () => {
    const stored = await chrome.storage.local.get("lastBackgroundVisitAt");
    if (Date.now() - (stored.lastBackgroundVisitAt ?? 0) < VISIT_COOLDOWN_MS) {
      await runSync();
      return;
    }

    const openTabs = await chrome.tabs.query({});
    if (openTabs.some(isTikTokTab)) {
      await runSync();
      return;
    }

    backgroundVisitInProgress = true;
    let tabId;
    let finalUrl = "";
    try {
      const tab = await chrome.tabs.create({ url: "https://www.tiktok.com/messages", active: false });
      tabId = tab.id;
      await waitForTabComplete(tab.id, tab);
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      finalUrl = (await chrome.tabs.get(tab.id)).url ?? "";
    } catch (error) {
      await setBadge(false, String(error?.message ?? "background_visit_failed").slice(0, 80), { markSync: false });
      return;
    } finally {
      if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => undefined);
      backgroundVisitInProgress = false;
    }

    const visitedAt = Date.now();
    await chrome.storage.local.set({ lastBackgroundVisitAt: visitedAt });
    const cookies = await chrome.cookies.getAll({ domain: "tiktok.com" });
    const path = (() => { try { return new URL(finalUrl).pathname.toLowerCase(); } catch { return ""; } })();
    const loggedOut = path === "/login" || path.startsWith("/login/") || !cookies.some((cookie) => cookie.name === "sessionid");
    if (loggedOut) {
      await chrome.storage.local.set({ sessionStatus: "logged_out" });
      await setBadge(false, "logged_out", { markSync: false });
      try { await postLoggedOut(visitedAt); } catch { /* retain logged_out badge; next visit can report again */ }
      return;
    }

    await runSync({ backgroundVisitAt: visitedAt });
  })().finally(() => { visitPromise = null; });
  return visitPromise;
}

function createAlarms() {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  chrome.alarms.create(VISIT_ALARM, { delayInMinutes: 1, periodInMinutes: 240 });
}

chrome.runtime.onInstalled.addListener(() => {
  createAlarms();
  chrome.storage.local.get("sessionStatus").then((state) => {
    if (!state.sessionStatus) setBadge(false, "waiting_for_background_visit", { markSync: false });
  });
});

chrome.runtime.onStartup.addListener(async () => {
  if (!(await chrome.alarms.get(SYNC_ALARM))) chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  if (!(await chrome.alarms.get(VISIT_ALARM))) chrome.alarms.create(VISIT_ALARM, { delayInMinutes: 1, periodInMinutes: 240 });
  await backgroundVisit();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void runSync();
  if (alarm.name === VISIT_ALARM) void backgroundVisit();
});

chrome.cookies.onChanged.addListener((change) => {
  const domain = change.cookie.domain.replace(/^\./, "").toLowerCase();
  if (domain === "tiktok.com" || domain.endsWith(".tiktok.com")) void runSync();
});
