import test from "node:test";
import assert from "node:assert/strict";
import { initialPolicy, decide } from "../attention/policy.js";
import { initialState, step } from "../attention/engine.js";
import { DEFAULTS } from "../attention/config.js";
import { relevanceKey, hostOf } from "../attention/relevance.js";

const S = 1000;
const t0 = Date.UTC(2026, 9, 31, 10, 0);
const cand = (kind, ts) => ({ kind, ts, id: `${kind}-${ts}`, evidence: {} });
const focus = { mode: "focus", unsure: false };

// Feed drift candidates every 30 s and return the levels that came out (null = nothing).
function levels(ctx, n = 4, policy = initialPolicy()) {
  const got = [];
  for (let i = 0; i < n; i++) {
    const r = decide(policy, cand("drift", t0 + i * 30 * S), ctx, DEFAULTS);
    policy = r.policy;
    got.push(r.trigger ? r.trigger.level : null);
  }
  return got;
}

test("drift escalates L1 → L2 → L3 in focus mode, then stays quiet", () => {
  assert.deepEqual(levels(focus), [1, 2, 3, null]);
});

test("gentle mode stops at L2", () => {
  assert.deepEqual(levels({ mode: "gentle", unsure: false }), [1, 2, null, null]);
});

test("an unsure page never goes past L1", () => {
  assert.deepEqual(levels({ mode: "focus", unsure: true }), [1, null, null, null]);
});

test("do not disturb logs a silent trigger", () => {
  const { trigger } = decide(initialPolicy(), cand("drift", t0), { mode: "dnd", unsure: false }, DEFAULTS);
  assert.equal(trigger.level, 0);
  assert.equal(trigger.suppressedBy, "dnd");
});

test("off says nothing at all", () => {
  assert.equal(decide(initialPolicy(), cand("drift", t0), { mode: "off", unsure: false }, DEFAULTS).trigger, null);
});

test("after a dismiss, louder words wait for the cooldown", () => {
  const policy = {
    episode: { kind: "drift", level: 2, startedTs: t0, triggerId: "drift-0" },
    cooldownUntil: { drift: t0 + 120 * S },
    lastLoudTs: { drift: t0 },
  };
  const early = decide(policy, cand("drift", t0 + 30 * S), focus, DEFAULTS);
  assert.equal(early.trigger.level, 1);
  assert.equal(early.trigger.suppressedBy, "cooldown");
  const late = decide(early.policy, cand("drift", t0 + 121 * S), focus, DEFAULTS);
  assert.equal(late.trigger.level, 3);
  assert.equal(late.trigger.suppressedBy, undefined);
});

test("return, break_over and session_start speak at L2 right away", () => {
  for (const kind of ["return", "break_over", "session_start"])
    assert.equal(decide(initialPolicy(), cand(kind, t0), focus, DEFAULTS).trigger.level, 2, kind);
});

test("a new episode starts at L1, and its L2 waits out the last loud word", () => {
  let { policy } = decide(initialPolicy(), cand("drift", t0), focus, DEFAULTS);
  ({ policy } = decide(policy, cand("drift", t0 + 30 * S), focus, DEFAULTS)); // L2
  policy = { ...policy, episode: null }; // "Take me back"
  const again = decide(policy, cand("drift", t0 + 60 * S), focus, DEFAULTS);
  assert.equal(again.trigger.level, 1);
  const louder = decide(again.policy, cand("drift", t0 + 90 * S), focus, DEFAULTS);
  assert.equal(louder.trigger.suppressedBy, "cooldown");
  const later = decide(louder.policy, cand("drift", t0 + 151 * S), focus, DEFAULTS);
  assert.equal(later.trigger.level, 2);
});

test("the engine uses the policy by default", () => {
  const url = "https://www.youtube.com/watch?v=a";
  const title = "Top 10 F1 crashes";
  let state = initialState();
  const out = [];
  const feed = (input) => {
    const r = step(state, input, DEFAULTS);
    state = r.state;
    out.push(...r.out);
  };
  feed({ type: "session", ts: t0, kind: "intent_set", payload: { id: "i1", title: "Fix the bug", topic: "shop" } });
  feed({
    type: "context",
    ts: t0,
    tabId: 1,
    url,
    host: hostOf(url),
    title,
    key: relevanceKey("i1", url, title),
    label: "unrelated",
    confidence: 0.9,
    audible: false,
    browserFocused: true,
    idleState: "active",
  });
  for (let ts = t0 + S; ts <= t0 + 120 * S; ts += S) feed({ type: "tick", ts });
  const drifts = out.filter((o) => o.type === "trigger").map((t) => [(t.ts - t0) / S, t.level]);
  assert.deepEqual(drifts, [
    [45, 1],
    [75, 2],
    [105, 3],
  ]);
});
