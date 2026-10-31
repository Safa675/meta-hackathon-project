import test from "node:test";
import assert from "node:assert/strict";
import { replay } from "../attention/replay.js";
import { DEFAULTS } from "../attention/config.js";
import { relevanceKey, hostOf } from "../attention/relevance.js";

// A hand-written log, not a recording: it pins replay's mechanics (which records
// are inputs, ticks between them). The criteria run on recorded logs in test/fixtures/.
const S = 1000;
const t0 = Date.UTC(2026, 9, 31, 10, 0);
const page = (ts, url, title, label) => ({
  type: "context",
  ts,
  tabId: 1,
  url,
  host: hostOf(url),
  title,
  key: relevanceKey("i1", url, title),
  label,
  confidence: 0.9,
  source: "llm",
  audible: false,
  browserFocused: true,
  idleState: "active",
});
const log = {
  version: 1,
  events: [
    { type: "session", ts: t0, kind: "intent_set", payload: { id: "i1", title: "Fix the bug", topic: "shop" } },
    page(t0, "https://github.com/acme/shop", "cart.js", "related"),
    page(t0 + 60 * S, "https://www.youtube.com/watch?v=a", "Top 10 F1 crashes", "unrelated"),
    // Outputs recorded by an older engine: replay recomputes them and ignores these.
    { type: "trigger", ts: t0 + 61 * S, id: "drift-old", kind: "drift", level: 3 },
    { type: "llm", ts: t0 + 61 * S, node: "classifyRelevance", ok: true },
    page(t0 + 200 * S, "https://github.com/acme/shop", "cart.js", "related"),
  ],
};

test("replay recomputes triggers from the logged inputs, with ticks between them", () => {
  const { triggers } = replay(log);
  assert.deepEqual(
    triggers.map((t) => [t.kind, (t.ts - t0) / S, t.level]),
    [
      ["drift", 105, 1],
      ["drift", 135, 2],
      ["drift", 165, 3],
    ],
  );
  assert.ok(!triggers.some((t) => t.id === "drift-old"));
});

test("replay takes engine settings", () => {
  const { triggers } = replay(log, { cfg: { ...DEFAULTS, toleranceSec: 100 } });
  assert.equal(triggers[0].ts, t0 + 160 * S);
});

test("replay is deterministic", () => {
  assert.deepEqual(replay(log), replay(log));
});

test("replay reports state changes too", () => {
  const { states } = replay(log);
  assert.deepEqual(
    states.map((s) => s.to),
    ["focused", "detour", "drifting", "focused"],
  );
});
