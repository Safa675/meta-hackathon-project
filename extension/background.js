// Background worker: tab capture into memory, the audit timer, distill and upkeep.
import { Memory } from "../memory/index.js";
import { modelClient, loadModelSettings } from "../memory/model.js";
import { runAudit } from "../agent/audit.js";

const memory = Memory.open();

const AUDIT_EVERY_MIN = 5;
const AUDIT_WINDOW_MIN = 30;
const IDLE_AFTER_SEC = 120;
const NOTIFY_GAP_MS = 15 * 60 * 1000; // at most one drift notification per 15 minutes
const MIN_CONFIDENCE = 0.6;

// ---- Schedules -----------------------------------------------------------

// Alarms can be lost on browser restart, so make sure they exist on every start.
const ALARMS = { audit: AUDIT_EVERY_MIN, distill: 60, "memory-maintain": 15 };
for (const [name, periodInMinutes] of Object.entries(ALARMS)) {
  chrome.alarms.get(name).then((a) => a || chrome.alarms.create(name, { periodInMinutes }));
}
chrome.idle.setDetectionInterval(IDLE_AFTER_SEC);

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === "audit") audit();
  else if (name === "distill") distill();
  else if (name === "memory-maintain") memory.then((m) => m.maintain());
});

// ---- Tab capture ---------------------------------------------------------

const record = (event) => memory.then((m) => m.recordActivity(event));
const OWN_PAGES = chrome.runtime.getURL("");

function recordTab(tab) {
  const url = tab?.url ?? "";
  if (!url || url === "about:blank") return; // transient, not a page the user chose
  // Time in this extension's own pages (settings) is neither work nor drift.
  if (url.startsWith(OWN_PAGES)) return record({ kind: "idle" });
  return record({ url, title: tab.title ?? "" });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

// The page in front of the user, if Chrome has focus.
async function recordActive() {
  const tab = await activeTab();
  if (!tab) return;
  const win = await chrome.windows.get(tab.windowId);
  if (win.focused) await recordTab(tab);
}

chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(recordTab));

// A URL change arrives before the page has its title, and a later title change is
// not always reported, so also record when loading completes. Repeated events on
// the same page merge into one span.
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.title || change.status === "complete")) recordTab(tab);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) record({ kind: "idle" });
  else recordActive();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") return recordActive();
  // No input while a video plays is not time away.
  if (state === "idle" && (await activeTab())?.audible) return;
  record({ kind: "idle" });
});

// ---- Audit ---------------------------------------------------------------

const BADGE = { on_track: ["", "#16a34a"], break: ["", "#64748b"], drifting: ["!", "#dc2626"], unclear: ["?", "#64748b"] };

async function audit({ manual = false } = {}) {
  const settings = await loadModelSettings();
  if (!settings?.apiKey && settings?.provider !== "ollama") {
    return save({ error: "No model set up. Open Settings and add your API key.", at: Date.now() });
  }
  // Heartbeat: a long stay on one page still shows up as time on it.
  if ((await chrome.idle.queryState(IDLE_AFTER_SEC)) === "active") await recordActive();
  try {
    const v = await runAudit(await memory, modelClient(settings), { minutes: AUDIT_WINDOW_MIN });
    const result = { ...v, intent: v.intent ? { id: v.intent.id, title: v.intent.title, next: v.intent.next } : null, at: Date.now() };
    await save(result);
    if (!manual && v.verdict === "drifting" && v.confidence >= MIN_CONFIDENCE) await notify(result);
    return result;
  } catch (err) {
    return save({ error: err.message ?? String(err), at: Date.now() });
  }
}

async function save(result) {
  await chrome.storage.local.set({ lastAudit: result });
  const [text, color] = result.error ? ["×", "#64748b"] : BADGE[result.verdict] ?? ["", "#64748b"];
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  return result;
}

async function notify(result) {
  const { lastNotified = 0 } = await chrome.storage.local.get("lastNotified");
  if (Date.now() - lastNotified < NOTIFY_GAP_MS) return;
  await chrome.notifications.create("drift", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("extension/icons/icon-128.png"),
    title: result.intent ? `Back to: ${result.intent.title}` : "Drifting?",
    message: result.nudge || result.reason,
    priority: 1,
  });
  await chrome.storage.local.set({ lastNotified: Date.now() });
}

// ---- Distill -------------------------------------------------------------

async function distill() {
  const settings = await loadModelSettings();
  if (!settings) return;
  try {
    const result = await (await memory).distill(modelClient(settings), { minutes: 60 });
    await chrome.storage.local.set({ lastDistill: { added: result.added, at: Date.now() } });
  } catch (err) {
    await chrome.storage.local.set({ lastDistill: { error: err.message ?? String(err), at: Date.now() } });
  }
}

// ---- Messages from the popup and settings pages --------------------------

const HANDLERS = {
  "audit-now": () => audit({ manual: true }),
  maintain: () => memory.then((m) => m.maintain()),
  "sync-brain": () => memory.then((m) => m.syncBrain()),
  "record-active": () => recordActive(),
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handler = HANDLERS[msg?.type];
  if (!handler) return;
  Promise.resolve()
    .then(handler)
    .then(reply, (err) => reply({ error: String(err) }));
  return true; // async reply
});
