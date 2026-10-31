// The attention engine: a pure reducer over browsing inputs. It keeps the drift
// budget and the state machine, and proposes trigger candidates that the policy
// turns into interventions. No Chrome, no clock: time comes from the inputs, so a
// recorded log replays exactly. Design: docs/superpowers/specs/2026-10-31-attention-agent-design.md §6.1.
import { DEFAULTS } from "./config.js";
import { isUnsure } from "./relevance.js";
import { initialPolicy, decide as policyDecide } from "./policy.js";

const S = 1000;

export function initialState() {
  return {
    mode: "focus",
    intent: null,
    state: "no_intent",
    budgetSec: 0,
    lastTs: null,
    current: null,
    lastRelevant: null,
    timeline: [],
    away: false,
    awaySince: null,
    breakUntil: null,
    sessionDay: null,
    asked: {},
    lastDriftTs: null,
    fragFiredTs: null,
    policy: initialPolicy(),
    tolerance: {},
  };
}

export function effectiveTolerance(state, cfg = DEFAULTS) {
  const base = state.tolerance[state.current?.host] ?? cfg.toleranceSec;
  return base * (state.mode === "gentle" ? cfg.gentleMultiplier : 1);
}

const labelOf = (current) => (!current || current.pending ? "neutral" : current.label);
const onBreak = (s, ts) => s.breakUntil != null && ts < s.breakUntil;

// The state before modes: what the person is doing.
function coreState(s, ts, cfg) {
  if (!s.intent) return "no_intent";
  if (onBreak(s, ts)) return "break";
  if (s.away) return "away";
  if (labelOf(s.current) === "unrelated") return s.budgetSec >= effectiveTolerance(s, cfg) ? "drifting" : "detour";
  return "focused";
}

function shownState(s, ts, cfg) {
  return s.mode === "dnd" || s.mode === "off" ? "paused" : coreState(s, ts, cfg);
}

function advance(s, dt, cfg) {
  if (!s.intent || s.away || s.mode === "off" || onBreak(s, s.lastTs)) return;
  const label = labelOf(s.current);
  if (label === "unrelated") s.budgetSec += dt;
  else if (label === "related") s.budgetSec = Math.max(0, s.budgetSec - dt * cfg.decayRate);
}

function windowStats(s, ts, cfg) {
  const from = ts - cfg.fragWindowSec * S;
  const inWindow = s.timeline.filter((e) => e.ts >= from);
  let unrelatedMs = 0;
  let totalMs = 0;
  s.timeline.forEach((e, i) => {
    const start = Math.max(e.ts, from);
    const end = s.timeline[i + 1]?.ts ?? ts;
    if (end <= start) return;
    totalMs += end - start;
    if (e.label === "unrelated") unrelatedMs += end - start;
  });
  return { switches: inWindow.length, unrelatedShare: totalMs ? unrelatedMs / totalMs : 0 };
}

function evidence(s, ts, cfg) {
  const entered = s.timeline.at(-1)?.ts ?? ts;
  return {
    host: s.current?.host ?? "",
    title: s.current?.title ?? "",
    dwellSec: Math.round((ts - entered) / S),
    budgetSec: Math.round(s.budgetSec),
    switches2m: windowStats(s, ts, cfg).switches,
    lastRelevant: s.lastRelevant,
  };
}

function rememberRelated(s, ts) {
  if (s.current?.label === "related" && !s.current.pending) {
    const { tabId, url, title } = s.current;
    s.lastRelevant = { tabId, url, title, ts };
  }
}

function applyContext(s, input, candidates, cfg) {
  const away = input.browserFocused === false || (input.idleState !== "active" && !input.audible);
  if (away) {
    if (!s.away) s.awaySince = input.ts;
    s.away = true;
    return [];
  }
  if (s.away && s.awaySince != null && s.intent && input.ts - s.awaySince >= cfg.returnAwaySec * S)
    candidates.push("return");
  s.away = false;
  s.awaySince = null;

  const out = [];
  const pending = !input.label;
  if (s.current?.key !== input.key) {
    s.timeline.push({ ts: input.ts, key: input.key, label: pending ? "neutral" : input.label });
    // Keep the window, plus the entry running into it.
    const firstIn = s.timeline.findIndex((e) => e.ts >= input.ts - cfg.fragWindowSec * S);
    if (firstIn > 0) s.timeline = s.timeline.slice(firstIn - 1);
  }
  const same = s.current?.key === input.key ? s.current : null;
  s.current = {
    key: input.key,
    tabId: input.tabId,
    url: input.url,
    host: input.host,
    title: input.title,
    label: pending ? (same?.label ?? "neutral") : input.label,
    confidence: pending ? (same?.confidence ?? 0) : (input.confidence ?? 1),
    pending: pending ? (same ? same.pending : true) : false,
  };
  if (s.current.pending && !s.asked[input.key]) {
    s.asked[input.key] = true;
    out.push({
      type: "need_relevance",
      ts: input.ts,
      key: input.key,
      url: input.url,
      host: input.host,
      title: input.title,
    });
  }
  rememberRelated(s, input.ts);
  return out;
}

function applyRelevance(s, input) {
  delete s.asked[input.key];
  if (s.current?.key !== input.key) return;
  Object.assign(s.current, { label: input.label, confidence: input.confidence, pending: false });
  const last = s.timeline.at(-1);
  if (last?.key === input.key) last.label = input.label;
  rememberRelated(s, input.ts);
}

function applySession(s, input) {
  if (input.kind === "intent_set") {
    s.intent = input.payload;
    s.budgetSec = 0;
    s.policy = initialPolicy();
  } else if (input.kind === "intent_done") {
    s.intent = null;
    s.budgetSec = 0;
    s.policy.episode = null;
  } else if (input.kind === "mode") {
    s.mode = input.payload.mode;
  }
}

function applyResponse(s, input, cfg) {
  if (input.choice === "back" || input.choice === "related" || input.choice === "break") {
    s.budgetSec = 0;
    s.policy.episode = null;
    s.lastDriftTs = null;
  }
  if (input.choice === "related" && s.current) {
    Object.assign(s.current, { label: "related", confidence: 1, pending: false });
    const last = s.timeline.at(-1);
    if (last?.key === s.current.key) last.label = "related";
    rememberRelated(s, input.ts);
  }
  if (input.choice === "break") s.breakUntil = input.ts + cfg.breakMin * 60 * S;
  if (input.choice === "dismiss" && s.policy.episode)
    s.policy.cooldownUntil[s.policy.episode.kind] = input.ts + cfg.cooldownSec * S;
}

export function step(prev, input, cfg = DEFAULTS) {
  const decide = cfg.decide ?? policyDecide;
  const s = structuredClone(prev);
  const ts = input.ts;
  const before = s.state;
  const out = [];
  const candidates = [];

  // 1. Time passes on the page that was in front.
  if (s.lastTs != null && ts > s.lastTs) {
    const dt = (ts - s.lastTs) / S;
    if (dt > cfg.maxGapSec) {
      // Sleep or a crash: the silence is time away, never time on the page.
      if (!s.away) s.awaySince = s.lastTs;
      s.away = true;
    } else {
      advance(s, dt, cfg);
    }
  }
  s.lastTs = Math.max(s.lastTs ?? ts, ts);

  // 2. The input itself.
  if (input.type === "context") out.push(...applyContext(s, input, candidates, cfg));
  else if (input.type === "relevance") applyRelevance(s, input);
  else if (input.type === "session") applySession(s, input);
  else if (input.type === "response") applyResponse(s, input, cfg);

  if (s.breakUntil != null && ts >= s.breakUntil) {
    s.breakUntil = null;
    if (s.intent) candidates.push("break_over");
  }

  // 3. Where that leaves the person.
  const core = coreState(s, ts, cfg);
  s.state = shownState(s, ts, cfg);
  if (s.state !== before)
    out.push({
      type: "state",
      ts,
      from: before,
      to: s.state,
      budgetSec: Math.round(s.budgetSec),
      switches2m: windowStats(s, ts, cfg).switches,
    });

  // 4. What might deserve a word.
  if (core === "drifting") {
    if (s.lastDriftTs == null || ts - s.lastDriftTs >= cfg.escalateAfterSec * S) {
      candidates.push("drift");
      s.lastDriftTs = ts;
    }
  } else {
    if (s.lastDriftTs != null) s.policy.episode = null;
    s.lastDriftTs = null;
  }
  if (s.intent && !s.away && (s.fragFiredTs == null || ts - s.fragFiredTs >= cfg.fragWindowSec * S)) {
    const w = windowStats(s, ts, cfg);
    if (w.switches >= cfg.fragMinSwitches && w.unrelatedShare >= cfg.fragUnrelatedShare) {
      candidates.push("fragmentation");
      s.fragFiredTs = ts;
    }
  }

  if (s.mode !== "off") {
    const ctx = { mode: s.mode, unsure: s.current ? isUnsure(s.current, cfg) : false };
    for (const kind of candidates) {
      const r = decide(s.policy, { kind, ts, id: `${kind}-${ts}`, evidence: evidence(s, ts, cfg) }, ctx, cfg);
      s.policy = r.policy;
      if (r.trigger) out.push({ type: "trigger", ...r.trigger });
    }
  }
  return { state: s, out };
}

// The earliest time a tick could change the outcome, or null.
export function nextWakeAt(s, cfg = DEFAULTS) {
  if (s.lastTs == null || s.mode === "off") return null;
  const times = [];
  if (s.breakUntil != null) times.push(s.breakUntil);
  const core = coreState(s, s.lastTs, cfg);
  if (core === "detour") times.push(s.lastTs + (effectiveTolerance(s, cfg) - s.budgetSec) * S);
  if (core === "drifting" && s.lastDriftTs != null) times.push(s.lastDriftTs + cfg.escalateAfterSec * S);
  return times.length ? Math.min(...times) : null;
}
