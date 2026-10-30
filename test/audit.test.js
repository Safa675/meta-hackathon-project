import test from "node:test";
import assert from "node:assert/strict";
import { auditMessages, parseVerdict, runAudit, VERDICTS } from "../agent/audit.js";

test("prompt carries activity and memory context; asks for JSON", () => {
  const [sys, user] = auditMessages({ activityText: "Last 30 min: youtube.com 25 min", contextPrompt: "Stated intent: Fix checkout bug", now: new Date("2026-10-30T10:00:00Z") });
  assert.match(sys.content, /one JSON object only/);
  assert.match(sys.content, /No medical or mental-health advice/);
  assert.match(user.content, /Now: 2026-10-30T10:00:00.000Z/);
  assert.match(user.content, /youtube\.com 25 min/);
  assert.match(user.content, /Fix checkout bug/);
});

test("parses a verdict through reasoning blocks and fences", () => {
  const v = parseVerdict('<think>hmm</think>```json\n{"verdict":"drifting","confidence":0.8,"reason":"25 min on youtube.com","nudge":"Back to the failing test?"}\n```');
  assert.deepEqual(v, { verdict: "drifting", confidence: 0.8, reason: "25 min on youtube.com", nudge: "Back to the failing test?" });
});

test("unknown verdicts become unclear; confidence is clamped; on_track has no nudge", () => {
  assert.equal(parseVerdict('{"verdict":"lazy","confidence":3}').verdict, "unclear");
  assert.equal(parseVerdict('{"verdict":"drifting","confidence":3}').confidence, 1);
  assert.equal(parseVerdict('{"verdict":"on_track","confidence":0.9,"nudge":"keep going"}').nudge, "");
  assert.deepEqual(VERDICTS, ["on_track", "drifting", "break", "unclear"]);
});

test("a reply without JSON is an error", () => {
  assert.throws(() => parseVerdict("I think you're doing fine."), /no JSON object/);
});

// Minimal stand-in for Memory: the audit only reads through these methods.
const fakeMemory = ({ spans, intent }) => ({
  activity: async () => ({ spans, text: spans.length ? "Last 30 min: youtube.com 25 min" : "Last 30 min: no browser activity." }),
  latestIntent: async () => intent,
  contextPack: async () => ({ prompt: "Stated intent: Fix checkout bug" }),
});

test("no activity or no intent: no model call", async () => {
  const never = async () => assert.fail("model should not be called");
  const a = await runAudit(fakeMemory({ spans: [], intent: { title: "x" } }), never);
  assert.equal(a.verdict, "unclear");
  const b = await runAudit(fakeMemory({ spans: [{ title: "t", url: "https://a.com" }], intent: undefined }), never);
  assert.equal(b.nudge, "What are you working on right now?");
});

test("with activity and intent, the model's verdict comes back with context", async () => {
  const mem = fakeMemory({ spans: [{ title: "Lofi", url: "https://youtube.com/w" }], intent: { title: "Fix checkout bug" } });
  const a = await runAudit(mem, async (messages) => {
    assert.match(messages[1].content, /youtube\.com 25 min/);
    return '{"verdict":"drifting","confidence":0.9,"reason":"25 min on youtube.com","nudge":"Write the failing test?"}';
  });
  assert.equal(a.verdict, "drifting");
  assert.equal(a.intent.title, "Fix checkout bug");
  assert.match(a.activity, /youtube/);
});
