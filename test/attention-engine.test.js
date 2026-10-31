import test from "node:test";
import assert from "node:assert/strict";
import { initialState, step, nextWakeAt } from "../attention/engine.js";
import { withOverrides } from "../attention/config.js";
import { relevanceKey, hostOf } from "../attention/relevance.js";

const S = 1000;
const t0 = Date.UTC(2026, 9, 31, 10, 0); // 13:00 in Istanbul
const intent = { id: "i1", title: "Fix the checkout bug", topic: "shop" };
const REPO = ["https://github.com/acme/shop", "cart.js · acme/shop"];
const VIDEO = ["https://www.youtube.com/watch?v=a", "Top 10 F1 crashes"];
const SEARCH = ["https://www.google.com/search?q=x", "x - Google Search"];

// Task 3 tests the engine alone: every candidate passes at level 1.
const stubDecide = (policy, cand) => ({ policy, trigger: { ...cand, level: 1 } });
const CFG = withOverrides();
CFG.decide = stubDecide;

const ctx = (ts, [url, title], label, extra = {}) => ({
  type: "context",
  ts,
  tabId: 1,
  url,
  host: hostOf(url),
  title,
  key: relevanceKey(intent.id, url, title),
  ...(label && { label, confidence: 0.9, source: "llm" }),
  audible: false,
  browserFocused: true,
  idleState: "active",
  ...extra,
});
const setIntent = (ts) => ({ type: "session", ts, kind: "intent_set", payload: intent });
const tick = (ts) => ({ type: "tick", ts });

// Run inputs in order, inserting 1 s ticks between them up to `until`.
function run(inputs, { until, cfg = CFG, state = initialState() } = {}) {
  const out = [];
  const sorted = [...inputs].sort((a, b) => a.ts - b.ts);
  const end = until ?? sorted.at(-1).ts;
  let i = 0;
  for (let ts = sorted[0].ts; ts <= end; ts += S) {
    while (i < sorted.length && sorted[i].ts <= ts) {
      const r = step(state, sorted[i++], cfg);
      state = r.state;
      out.push(...r.out);
    }
    const r = step(state, tick(ts), cfg);
    state = r.state;
    out.push(...r.out);
  }
  return { state, out, triggers: out.filter((o) => o.type === "trigger") };
}

test("unrelated past tolerance → drift", () => {
  const { state, triggers } = run([setIntent(t0), ctx(t0, REPO, "related"), ctx(t0 + 10 * S, VIDEO, "unrelated")], {
    until: t0 + 60 * S,
  });
  const drift = triggers.find((t) => t.kind === "drift");
  assert.ok(drift, "a drift trigger");
  assert.ok(Math.abs(drift.ts - (t0 + 55 * S)) <= S, `drift at ${(drift.ts - t0) / S}s`);
  assert.equal(drift.evidence.host, "youtube.com");
  assert.equal(drift.evidence.lastRelevant.url, REPO[0]);
  assert.equal(state.state, "drifting");
});

test("related never warns", () => {
  const { state, triggers } = run([setIntent(t0), ctx(t0, REPO, "related")], { until: t0 + 600 * S });
  assert.equal(triggers.length, 0);
  assert.equal(state.budgetSec, 0);
  assert.equal(state.state, "focused");
});

test("neutral leaves the budget unchanged", () => {
  const { state } = run([setIntent(t0), ctx(t0, VIDEO, "unrelated"), ctx(t0 + 20 * S, SEARCH, "neutral")], {
    until: t0 + 320 * S,
  });
  assert.equal(state.budgetSec, 20);
});

test("unsure pages accumulate budget", () => {
  const unsure = ctx(t0, VIDEO, "unrelated", { confidence: 0.4 });
  const { state, triggers } = run([setIntent(t0), unsure], { until: t0 + 50 * S });
  assert.equal(state.budgetSec, 50);
  assert.ok(triggers.some((t) => t.kind === "drift"));
});

test("related time drains the budget at the decay rate", () => {
  const { state } = run([setIntent(t0), ctx(t0, VIDEO, "unrelated"), ctx(t0 + 30 * S, REPO, "related")], {
    until: t0 + 40 * S,
  });
  assert.equal(state.budgetSec, 10);
});

test("hopping between tabs is fragmentation", () => {
  const pages = [
    VIDEO,
    REPO,
    ["https://x.com/home", "Home / X"],
    REPO,
    ["https://reddit.com/r/f1", "r/f1"],
    REPO,
    VIDEO,
  ];
  const labels = ["unrelated", "related", "unrelated", "related", "unrelated", "related", "unrelated"];
  const durations = [16, 6, 16, 6, 16, 6, 24]; // 7 switches in 90 s, 72 s of it unrelated
  let ts = t0;
  const inputs = [setIntent(t0)];
  pages.forEach((p, i) => {
    inputs.push(ctx(ts, p, labels[i]));
    ts += durations[i] * S;
  });
  const { triggers } = run(inputs, { until: ts, cfg: { ...CFG, toleranceSec: 1000 } });
  assert.equal(triggers.filter((t) => t.kind === "fragmentation").length, 1);
});

test("a relevance answer for a page the user left does not relabel the page in front", () => {
  let { state, out } = step(initialState(), setIntent(t0), CFG);
  ({ state, out } = step(state, ctx(t0, VIDEO), CFG));
  assert.deepEqual(
    out.filter((o) => o.type === "need_relevance").map((o) => o.key),
    [relevanceKey(intent.id, ...VIDEO)],
  );
  ({ state } = step(state, ctx(t0 + S, REPO, "related"), CFG));
  const before = structuredClone(state);
  ({ state, out } = step(
    state,
    {
      type: "relevance",
      ts: t0 + 2 * S,
      key: relevanceKey(intent.id, ...VIDEO),
      label: "unrelated",
      confidence: 0.9,
      source: "llm",
    },
    CFG,
  ));
  assert.equal(state.current.key, before.current.key);
  assert.equal(state.current.label, "related");
  assert.equal(out.filter((o) => o.type === "state").length, 0);
});

test("a page waiting for its label counts as neutral and asks once", () => {
  let r = step(initialState(), setIntent(t0), CFG);
  r = step(r.state, ctx(t0, VIDEO), CFG);
  r = step(r.state, ctx(t0 + S, VIDEO), CFG); // a title update on the same page
  assert.equal(r.out.filter((o) => o.type === "need_relevance").length, 0);
  const { state } = run([tick(t0 + 2 * S)], { state: r.state, until: t0 + 60 * S });
  assert.equal(state.budgetSec, 0);
});

test("a long silence is time away, not drift", () => {
  let { state } = step(initialState(), setIntent(t0), CFG);
  ({ state } = step(state, ctx(t0, VIDEO, "unrelated"), CFG));
  const r = step(state, tick(t0 + 30 * 60 * S), CFG);
  assert.equal(r.out.filter((o) => o.type === "trigger").length, 0);
  assert.equal(r.state.budgetSec, 0);
  assert.equal(r.state.state, "away");
});

test("coming back after a long time away is a return", () => {
  const away = ctx(t0 + 10 * S, REPO, "related", { idleState: "idle" });
  const back = ctx(t0 + 400 * S, REPO, "related");
  const { triggers } = run([setIntent(t0), ctx(t0, REPO, "related"), away, back], { until: t0 + 401 * S });
  assert.deepEqual(
    triggers.map((t) => t.kind),
    ["return"],
  );
});

test("a JSON round trip mid-drift changes nothing", () => {
  const inputs = [setIntent(t0), ctx(t0, VIDEO, "unrelated")];
  const straight = run(inputs, { until: t0 + 50 * S });
  const half = run(inputs, { until: t0 + 40 * S });
  const resumed = run([tick(t0 + 41 * S)], { state: JSON.parse(JSON.stringify(half.state)), until: t0 + 50 * S });
  const drifts = (ts) => ts.filter((t) => t.kind === "drift").map((t) => t.ts);
  assert.deepEqual([...drifts(half.triggers), ...drifts(resumed.triggers)], drifts(straight.triggers));
  assert.equal(drifts(straight.triggers).length, 1);
});

test("an audible tab while idle is not away; an unfocused browser is", () => {
  let { state } = step(initialState(), setIntent(t0), CFG);
  ({ state } = step(state, ctx(t0, REPO, "related", { idleState: "idle", audible: true }), CFG));
  assert.equal(state.state, "focused");
  ({ state } = step(state, ctx(t0 + S, REPO, "related", { browserFocused: false }), CFG));
  assert.equal(state.state, "away");
});

test("a break holds off drift, then ends with break_over", () => {
  const inputs = [
    setIntent(t0),
    ctx(t0, VIDEO, "unrelated"),
    { type: "response", ts: t0 + 10 * S, triggerId: "x", choice: "break" },
  ];
  const { triggers, state } = run(inputs, { until: t0 + 10 * S + 5 * 60 * S });
  assert.deepEqual(
    triggers.map((t) => t.kind),
    ["break_over"],
  );
  assert.equal(triggers[0].ts, t0 + 10 * S + 5 * 60 * S);
  assert.notEqual(state.state, "break");
});

test("no intent, no drift", () => {
  const { triggers, state } = run([ctx(t0, VIDEO, "unrelated")], { until: t0 + 120 * S });
  assert.deepEqual(
    triggers.filter((t) => t.kind !== "session_start"),
    [],
  );
  assert.equal(state.state, "no_intent");
});

test("step never mutates its input", () => {
  let { state } = step(initialState(), setIntent(t0), CFG);
  const frozen = structuredClone(state);
  step(state, ctx(t0, VIDEO, "unrelated"), CFG);
  assert.deepEqual(state, frozen);
});

test("nextWakeAt is when the budget will cross tolerance", () => {
  const { state } = run([setIntent(t0), ctx(t0, VIDEO, "unrelated")], { until: t0 + 10 * S });
  assert.equal(state.budgetSec, 10);
  assert.equal(nextWakeAt(state, CFG), state.lastTs + 35 * S);
});

test("Take me back ends the episode and empties the budget", () => {
  const { state } = run(
    [setIntent(t0), ctx(t0, VIDEO, "unrelated"), { type: "response", ts: t0 + 50 * S, triggerId: "d", choice: "back" }],
    { until: t0 + 50 * S },
  );
  assert.equal(state.budgetSec, 0);
});

test("session_start greets the first active page of a day once, only without a goal", () => {
  const cfg = { ...CFG, tzOffsetMin: -180 };
  const morning = Date.UTC(2026, 10, 1, 6, 0); // 09:00 in Istanbul
  const kinds = (inputs, until) =>
    run(inputs, { until, cfg })
      .triggers.filter((t) => t.kind === "session_start")
      .map((t) => t.ts);
  assert.deepEqual(kinds([ctx(morning, REPO), ctx(morning + 60 * S, VIDEO)], morning + 70 * S), [morning]);
  assert.deepEqual(kinds([setIntent(morning), ctx(morning, REPO, "related")], morning + 10 * S), []);
});

test("one nudge at a time: no fragmentation while a drift is running", () => {
  const X = ["https://x.com/home", "Home / X"];
  const inputs = [setIntent(t0), ctx(t0, VIDEO, "unrelated")];
  // Drift starts at 45 s; then hop between unrelated pages while drifting.
  [X, VIDEO, X, VIDEO, X, VIDEO, X].forEach((p, i) => inputs.push(ctx(t0 + (50 + i * 5) * S, p, "unrelated")));
  const { triggers } = run(inputs, { until: t0 + 90 * S });
  assert.ok(triggers.some((t) => t.kind === "drift"));
  assert.equal(triggers.filter((t) => t.kind === "fragmentation").length, 0);
});

test("review I4: one navigation (url, then title, then load) is one page switch", () => {
  const url = "https://www.youtube.com/watch?v=a";
  let r = step(initialState(), setIntent(t0), CFG);
  r = step(r.state, ctx(t0, REPO, "related"), CFG);
  r = step(r.state, ctx(t0 + 100, [url, REPO[1]]), CFG); // new URL, old title
  r = step(r.state, ctx(t0 + 300, [url, "Top 10 F1 crashes"]), CFG); // the real title
  r = step(r.state, ctx(t0 + 400, [url, "Top 10 F1 crashes"]), CFG); // load complete
  assert.equal(r.state.timeline.length, 2);
  assert.equal(r.state.current.key, relevanceKey(intent.id, url, "Top 10 F1 crashes"));
});

test("review I5: no goal, no relevance requests", () => {
  const r = step(initialState(), ctx(t0, VIDEO), CFG);
  assert.equal(r.out.filter((o) => o.type === "need_relevance").length, 0);
  assert.deepEqual(r.state.asked, {});
});

test("review I5: an unanswered relevance request is asked again after 30 s", () => {
  let r = step(initialState(), setIntent(t0), CFG);
  r = step(r.state, ctx(t0, VIDEO), CFG);
  r = step(r.state, ctx(t0 + 10 * S, REPO, "related"), CFG);
  r = step(r.state, ctx(t0 + 40 * S, VIDEO), CFG);
  assert.equal(r.out.filter((o) => o.type === "need_relevance").length, 1);
});

test("review I6: turning Off back on is not a return from away", () => {
  let r = step(initialState(), setIntent(t0), CFG);
  r = step(r.state, ctx(t0, REPO, "related"), CFG);
  r = step(r.state, { type: "session", ts: t0 + S, kind: "mode", payload: { mode: "off" } }, CFG);
  r = step(r.state, { type: "session", ts: t0 + 600 * S, kind: "mode", payload: { mode: "focus" } }, CFG);
  assert.equal(r.state.away, false);
  r = step(r.state, ctx(t0 + 601 * S, REPO, "related"), CFG);
  assert.equal(r.out.filter((o) => o.type === "trigger").length, 0);
});

test("minor 1: This is for my task relabels the nudged page, not the page in front", () => {
  const X = ["https://x.com/home", "Home / X"];
  let r = step(initialState(), setIntent(t0), CFG);
  r = step(r.state, ctx(t0, REPO, "related"), CFG);
  r = step(r.state, ctx(t0 + 10 * S, X, "unrelated"), CFG); // the user moved on
  r = step(r.state, { type: "response", ts: t0 + 11 * S, choice: "related", pageUrl: VIDEO[0] }, CFG);
  assert.equal(r.state.current.label, "unrelated");
  assert.equal(r.state.lastRelevant.url, REPO[0]);
});

test("minor 2: heartbeat ticks while away do not count as activity", () => {
  let r = step(initialState(), setIntent(t0), CFG);
  r = step(r.state, ctx(t0, REPO, "related"), CFG);
  r = step(r.state, ctx(t0 + S, REPO, "related", { idleState: "locked" }), CFG);
  for (let ts = t0 + 31 * S; ts < t0 + 3600 * S; ts += 30 * S) r = step(r.state, tick(ts), CFG);
  assert.equal(r.state.lastActiveTs, t0);
});

test("minor 7: break_over stays quiet when the user is already back at work", () => {
  const inputs = [
    setIntent(t0),
    ctx(t0, VIDEO, "unrelated"),
    { type: "response", ts: t0 + 10 * S, triggerId: "x", choice: "break" },
    ctx(t0 + 200 * S, REPO, "related"),
  ];
  const { triggers } = run(inputs, { until: t0 + 10 * S + 5 * 60 * S });
  assert.deepEqual(triggers, []);
});
