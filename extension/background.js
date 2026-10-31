// Background worker: the shell around the attention engine. Chrome events become
// engine inputs, processed one at a time; engine state lives in
// chrome.storage.session (the worker can stop at any moment); every input and
// output goes to the event log; unknown pages are judged by the model (LLM#1).
import { Memory } from "../memory/index.js";
import { modelClient, loadModelSettings } from "../memory/model.js";
import { withOverrides } from "../attention/config.js";
import { hostOf, relevanceKey, labelKeys, builtinLabel } from "../attention/relevance.js";
import { initialState, step, nextWakeAt } from "../attention/engine.js";
import { makeIntent, isExpired } from "../attention/intents.js";
import { createSerialQueue } from "../attention/queue.js";
import { openStore } from "../attention/store.js";
import { classifyRelevance } from "../agent/relevance.js";
import { contextFlags } from "./sensor.js";

const memory = Memory.open();
const store = openStore();
const enqueue = createSerialQueue();
const OWN_PAGES = chrome.runtime.getURL("");
const IDLE_AFTER_SEC = 120;
const BADGE = { loud: ["!", "#dc2626"], look: ["·", "#64748b"] };

// ---- Schedules -----------------------------------------------------------

// Alarms can be lost on browser restart, so make sure they exist on every start.
const ALARMS = { distill: 60, "memory-maintain": 15, "attention-heartbeat": 0.5 };
for (const [name, periodInMinutes] of Object.entries(ALARMS)) {
  chrome.alarms.get(name).then((a) => a || chrome.alarms.create(name, { periodInMinutes }));
}
chrome.idle.setDetectionInterval(IDLE_AFTER_SEC);

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === "attention-heartbeat" || name === "attention-wake") tick();
  else if (name === "distill") distill();
  else if (name === "memory-maintain") maintain();
});

async function config() {
  const { attentionConfig } = await chrome.storage.local.get("attentionConfig");
  return withOverrides(attentionConfig);
}

const loadEngine = async () => (await chrome.storage.session.get("engine")).engine ?? initialState();

// Session storage is wiped when Chrome restarts or the extension reloads, but the
// goal (IndexedDB) and the mode (local storage) survive: give them back to the engine.
// Runs inside the queue.
async function engineState(cfg, ts) {
  const { engine } = await chrome.storage.session.get("engine");
  if (engine) return engine;
  let s = initialState();
  const { mode } = await chrome.storage.local.get("mode");
  if (mode && mode !== "focus")
    s = (await apply(s, { type: "session", ts, kind: "mode", payload: { mode } }, cfg)).state;
  const st = await store;
  const intent = await st.activeIntent();
  if (intent && isExpired(intent, ts, ts, cfg)) await st.putIntent({ ...intent, expiredAt: ts });
  else if (intent) {
    const payload = { id: intent.id, title: intent.title, topic: intent.topic, restored: true };
    s = (await apply(s, { type: "session", ts, kind: "intent_set", payload }, cfg)).state;
  }
  await saveEngine(s);
  return s;
}
const saveEngine = (engine) => chrome.storage.session.set({ engine });
const log = async (record) => (await store).appendEvent(record);

// ---- The engine loop -----------------------------------------------------

// Runs inside the queue. Returns the new engine state.
async function process(input) {
  const cfg = await config();
  let s = await engineState(cfg, input.ts);
  if (s.mode === "off" && input.type !== "session" && input.type !== "response") return s;

  // A goal left over from yesterday (or hours ago) becomes an open loop.
  if (input.type === "context" && s.intent) {
    const intent = await (await store).activeIntent();
    if (intent && isExpired(intent, input.ts, s.lastTs ?? input.ts, cfg)) {
      await (await store).putIntent({ ...intent, expiredAt: input.ts });
      const done = { type: "session", ts: input.ts, kind: "intent_done", payload: { id: intent.id, expired: true } };
      s = (await apply(s, done, cfg)).state;
    }
  }
  return (await apply(s, input, cfg)).state;
}

async function apply(s, input, cfg) {
  const r = step(s, input, cfg);
  await saveEngine(r.state);
  await log(input); // ticks too: replay tells sleep from a long stay by them
  for (const o of r.out) {
    if (o.type === "need_relevance") askRelevance(o);
    else {
      await log(o);
      if (o.type === "trigger") await showTrigger(o, r.state);
      if (o.type === "state" && ["focused", "no_intent", "paused"].includes(o.to)) await setBadge(null);
    }
  }
  scheduleWake(r.state, cfg);
  return r;
}

const feed = (input) => enqueue(() => process(input));
const tick = () => feed({ type: "tick", ts: Date.now() });

let wakeTimer = null;
function scheduleWake(s, cfg) {
  const at = nextWakeAt(s, cfg);
  clearTimeout(wakeTimer);
  if (at == null) return;
  const delay = at - Date.now();
  // Alarms fire no sooner than 30 s; a timer covers the short waits while the worker is awake.
  if (delay <= 30000) wakeTimer = setTimeout(tick, Math.max(0, delay) + 50);
  else chrome.alarms.create("attention-wake", { when: at });
}

// ---- Sensor --------------------------------------------------------------

const record = (event) => memory.then((m) => m.recordActivity(event));

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

// Each Chrome event is queued the moment it arrives; the Chrome lookups happen
// inside the job, so the engine sees events in arrival order.
// getTab: () => Promise<Tab>. opts: {idleState?, forceUnfocused?}.
const sense = (getTab, opts = {}) => enqueue(() => contextJob(getTab, opts));

async function contextJob(getTab, { idleState, forceUnfocused = false } = {}) {
  const tab = await getTab().catch(() => null);
  if (!tab || tab.url === "about:blank") return; // transient, not a page the user chose
  const win = await chrome.windows.getLastFocused().catch(() => null);
  const flags = contextFlags(tab, {
    focusedWindowId: win?.focused ? win.id : -1,
    idleState: idleState ?? (await chrome.idle.queryState(IDLE_AFTER_SEC)),
    forceUnfocused,
  });
  if (!flags) return; // not the page in front
  let url = tab.url ?? "";
  let title = tab.title ?? "";
  // Time in this extension's own pages (settings) is neither work nor drift, and stays out of the log.
  if (url.startsWith(OWN_PAGES)) {
    url = "";
    title = "";
    record({ kind: "idle" });
  } else if (flags.browserFocused && flags.idleState === "active") {
    record({ url, title });
  } else if (!tab.audible) {
    record({ kind: "idle" });
  }
  const ts = Date.now();
  const cfg = await config();
  const s = await engineState(cfg, ts);
  return process({
    type: "context",
    ts,
    tabId: tab.id,
    url,
    host: hostOf(url),
    title,
    key: relevanceKey(s.intent?.id ?? "none", url, title),
    audible: !!tab.audible,
    ...flags,
    ...(await knownLabel(s.intent, url, title)),
  });
}

// Built-in rules, then the user's labels, then the cache. Unknown → the engine asks.
async function knownLabel(intent, url, title) {
  if (builtinLabel(url, OWN_PAGES)) return { label: "neutral", confidence: 1, source: "builtin" };
  if (!intent) return {};
  const st = await store;
  for (const key of labelKeys(intent.topic, url, title)) {
    const l = await st.getLabel(key);
    if (l) return { label: l.label, confidence: 1, source: "label" };
  }
  const cached = await st.getCached(relevanceKey(intent.id, url, title));
  return cached ? { label: cached.label, confidence: cached.confidence, source: "cache" } : {};
}

chrome.tabs.onActivated.addListener(({ tabId }) => sense(() => chrome.tabs.get(tabId)));

// A bare URL change carries the previous page's title, so wait for the new title
// or for loading to complete. Same-page repeats are one page to the engine.
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.title || change.status === "complete")) sense(async () => tab);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) sense(activeTab, { forceUnfocused: true });
  else sense(activeTab);
});

chrome.idle.onStateChanged.addListener((state) => sense(activeTab, { idleState: state }));

// ---- Relevance (LLM#1) ---------------------------------------------------

function askRelevance(need) {
  // Outside the queue; a failure leaves the page neutral and the engine asks again later.
  judge(need).catch((err) =>
    log({ type: "llm", ts: Date.now(), node: "classifyRelevance", ok: false, error: String(err) }),
  );
}

async function judge(need) {
  const s = await loadEngine();
  if (!s.intent) return;
  const settings = await loadModelSettings();
  const st = await store;
  const intent = (await st.activeIntent()) ?? s.intent;
  const examples = (await st.recentLabels(20))
    .filter((l) => l.topic === intent.topic)
    .slice(0, 5)
    .map(({ host, title, label }) => ({ host, title, label }));
  let r;
  try {
    r = await classifyRelevance(modelClient(settings ?? {}), {
      intent,
      url: need.url,
      title: need.title,
      examples,
    });
  } catch (err) {
    // No model set up: the page stays neutral.
    r = { label: "neutral", confidence: 0, source: "fallback", latencyMs: 0, error: err.message ?? String(err) };
  }
  await log({
    type: "llm",
    ts: Date.now(),
    node: "classifyRelevance",
    model: settings?.model ?? settings?.provider ?? null,
    latencyMs: r.latencyMs,
    ok: r.source === "llm",
    ...(r.error && { error: r.error }),
  });
  if (r.source === "llm")
    await st.putCached({ key: need.key, label: r.label, confidence: r.confidence, source: "llm", ts: Date.now() });
  await feed({
    type: "relevance",
    ts: Date.now(),
    key: need.key,
    label: r.label,
    confidence: r.confidence,
    source: r.source,
    latencyMs: r.latencyMs,
    intentId: s.intent.id,
  });
}

// ---- Interventions -------------------------------------------------------

async function setBadge(kind) {
  const [text, color] = kind ? BADGE[kind] : ["", "#64748b"];
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// Level 0 (do not disturb) is logged only; everything else is shown.
async function showTrigger(t, s) {
  if (t.level < 1) return;
  await chrome.storage.local.set({ lastTrigger: { ...t, intentTitle: s.intent?.title ?? null } });
  await setBadge(t.level >= 2 ? "loud" : "look");
}

async function respond({ choice }) {
  return enqueue(async () => {
    const { lastTrigger } = await chrome.storage.local.get("lastTrigger");
    const ts = Date.now();
    const before = await engineState(await config(), ts);
    const page = lastTrigger?.evidence; // the page the nudge was about
    const s = await process({
      type: "response",
      ts,
      triggerId: lastTrigger?.id ?? null,
      choice,
      latencyMs: lastTrigger ? ts - lastTrigger.ts : null,
    });
    await chrome.storage.local.set({ lastTrigger: lastTrigger ? { ...lastTrigger, respondedAt: ts, choice } : null });
    await setBadge(null);
    if (choice === "back") await takeMeBack(s.lastRelevant);
    if (choice === "related" && page?.host && before.intent) await markRelated(page, before.intent, ts);
    return { ok: true };
  });
}

// Focus the last related tab, or reopen its page.
async function takeMeBack(last) {
  if (!last) return;
  const tab = await chrome.tabs.get(last.tabId).catch(() => null);
  // The tab may be gone, or now showing something else: then reopen the page.
  if (tab && tab.url === last.url) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: last.url, active: true });
  }
}

// page: {url, host, title} from the trigger's evidence.
async function markRelated(page, intent, ts) {
  const key = labelKeys(intent.topic, page.url, page.title)[0];
  const label = { key, label: "related", topic: intent.topic, host: page.host, title: page.title, ts };
  await (await store).putLabel(label);
  await log({ type: "feedback", ts, kind: "label", payload: label });
  await (
    await memory
  ).add({
    kind: "preference",
    topic: intent.topic,
    title: `${page.host} counts as work for ${intent.topic}`.slice(0, 120),
    context: "Marked by the user from a nudge.",
    result: "related",
  });
}

// ---- Goals and modes -----------------------------------------------------

async function setIntent({ title, next }) {
  return enqueue(async () => {
    const st = await store;
    const previous = await st.activeIntent();
    if (previous) await st.putIntent({ ...previous, doneAt: Date.now(), replaced: true });
    const entry = await (await memory).setIntent({ title, next: next || undefined });
    const intent = makeIntent({ title, steps: next ? [next] : [], memoryEntryId: entry.id }, Date.now());
    await (await store).putIntent(intent);
    await process({
      type: "session",
      ts: Date.now(),
      kind: "intent_set",
      payload: { id: intent.id, title, topic: intent.topic },
    });
    return intent;
  });
}

async function completeIntent() {
  return enqueue(async () => {
    const st = await store;
    const intent = await st.activeIntent();
    if (!intent) return null;
    if (intent.memoryEntryId) await (await memory).completeIntent(intent.memoryEntryId).catch(() => {});
    await st.putIntent({ ...intent, doneAt: Date.now() });
    await process({ type: "session", ts: Date.now(), kind: "intent_done", payload: { id: intent.id } });
    return intent;
  });
}

const setMode = ({ mode }) =>
  enqueue(async () => {
    await chrome.storage.local.set({ mode });
    return process({ type: "session", ts: Date.now(), kind: "mode", payload: { mode } });
  });

const status = () =>
  enqueue(async () => {
    const { lastTrigger } = await chrome.storage.local.get("lastTrigger");
    const engine = await engineState(await config(), Date.now());
    return { engine, lastTrigger: lastTrigger ?? null, intent: await (await store).activeIntent() };
  });

// ---- Distill and upkeep --------------------------------------------------

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

async function maintain() {
  await (await memory).maintain();
  const cfg = await config();
  await (await store).pruneBefore(Date.now() - cfg.retentionDays * 24 * 3600 * 1000);
}

// ---- Messages from the popup and settings pages --------------------------

const HANDLERS = {
  "set-intent": setIntent,
  "complete-intent": completeIntent,
  "set-mode": setMode,
  respond,
  "get-status": status,
  "export-log": async () => (await store).exportLog(),
  "import-log": async ({ log }) => (await store).importLog(log),
  "record-active": () => sense(activeTab),
  maintain,
  "sync-brain": () => memory.then((m) => m.syncBrain()),
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handler = HANDLERS[msg?.type];
  if (!handler) return;
  Promise.resolve()
    .then(() => handler(msg))
    .then(reply, (err) => reply({ error: String(err) }));
  return true; // async reply
});
