import test from "node:test";
import assert from "node:assert/strict";
import { present, nudgeText } from "../extension/overlay/present.js";

const evidence = {
  url: "https://www.youtube.com/watch?v=a",
  host: "youtube.com",
  title: "Top 10 F1 crashes",
  dwellSec: 52,
  lastRelevant: { url: "https://github.com/acme/shop", title: "cart.js · acme/shop" },
};
const trigger = (kind, level) => ({
  type: "trigger",
  id: `${kind}-1`,
  kind,
  level,
  evidence,
  intentTitle: "Fix the bug",
});

test("L1 drift: Tuck arrives with a welcome hop, settles to resting, says nothing", () => {
  assert.deepEqual(present({ trigger: trigger("drift", 1) }), {
    tuck: "welcome",
    settle: "resting",
    bubble: null,
    triggerId: "drift-1",
  });
});

test("L2 and L3 drift: thinking, with the message and the three answers", () => {
  for (const level of [2, 3]) {
    const v = present({ trigger: trigger("drift", level) });
    assert.equal(v.tuck, "thinking");
    assert.equal(v.bubble.kind, "nudge");
    assert.equal(v.bubble.text, "You've been on youtube.com for 52 s — back to Fix the bug?");
    assert.deepEqual(
      v.bubble.buttons.map((b) => b.choice),
      ["back", "related", "break"],
    );
    assert.equal(v.bubble.dismissable, true);
  }
});

test("fragmentation at L2 is a nudge too", () => {
  const v = present({ trigger: trigger("fragmentation", 2) });
  assert.equal(v.tuck, "thinking");
  assert.equal(v.bubble.text, "Lots of tab hopping — want to pick one thing?");
});

test("return and break_over: a check-in wave with a nudge", () => {
  const r = present({ trigger: trigger("return", 2) });
  assert.equal(r.tuck, "checkin");
  assert.equal(r.bubble.text, "Welcome back. You were on cart.js · acme/shop.");
  assert.deepEqual(
    r.bubble.buttons.map((b) => b.choice),
    ["back"],
  );
  const b = present({ trigger: trigger("break_over", 2) });
  assert.equal(b.tuck, "checkin");
  assert.equal(b.bubble.text, "Break's over — ready for Fix the bug?");
});

test("session_start: check-in with the goal form and up to two things to pick up", () => {
  const v = present({
    trigger: trigger("session_start", 2),
    loops: [{ title: "Edit the demo video" }, { title: "Write the README" }, { title: "Third" }],
  });
  assert.equal(v.tuck, "checkin");
  assert.equal(v.bubble.kind, "goal");
  assert.equal(v.bubble.text, "Hi! What are we working on today?");
  assert.deepEqual(v.bubble.pickUp, ["Edit the demo video", "Write the README"]);
});

test("after Done: what's next, with the goal form", () => {
  const v = present({ event: "goal_done" });
  assert.equal(v.tuck, "checkin");
  assert.equal(v.bubble.kind, "goal");
  assert.equal(v.bubble.text, "Nice! What's next?");
});

test("goal set and nudge resolved: a welcome hop, then Tuck leaves", () => {
  assert.deepEqual(present({ event: "goal_set" }), {
    tuck: "welcome",
    bubble: { kind: "note", text: "Got it — let's go." },
    leaveAfterMs: 2000,
  });
  assert.deepEqual(present({ event: "resolved" }), { tuck: "welcome", bubble: null, leaveAfterMs: 2000 });
});

test("clicking Tuck with no nudge shows the goal card", () => {
  const v = present({ event: "card", intent: { title: "Fix the bug", steps: ["Write the failing test"] } });
  assert.equal(v.tuck, "resting");
  assert.deepEqual(v.bubble, { kind: "card", text: "Fix the bug", next: "Write the failing test" });
});

test("clicking Tuck with no goal opens the goal form", () => {
  const v = present({ event: "card", intent: null });
  assert.equal(v.bubble.kind, "goal");
});

test("level 0 (do not disturb) and session_start without loops", () => {
  assert.equal(present({ trigger: trigger("drift", 0) }), null);
  assert.deepEqual(present({ trigger: trigger("session_start", 2) }).bubble.pickUp, []);
});

test("nudgeText keeps the popup and Tuck saying the same thing", () => {
  assert.equal(nudgeText(trigger("drift", 1)), "You've been on youtube.com for 52 s — back to Fix the bug?");
  assert.equal(nudgeText({ ...trigger("drift", 1), evidence: { ...evidence, dwellSec: 150 } }).includes("3 min"), true);
});
