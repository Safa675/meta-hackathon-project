import test from "node:test";
import assert from "node:assert/strict";
import { distillMessages, parseEntries, extractJsonArray, MAX_ENTRIES } from "../memory/distill.js";

const good = {
  kind: "todo",
  topic: "Shop",
  title: "Started the checkout bug fix",
  context: "Spent 30 min on the cart code.",
  result: "Found the cart drops items on reload.",
  evidence: "github.com 30 min",
  next: "Write the failing test",
};

test("prompt carries the activity, memory context, topics and date", () => {
  const [sys, user] = distillMessages({
    activityText: "Last 60 min: x",
    contextPrompt: "Open loops: y",
    topics: ["shop"],
    date: "2026-10-30",
  });
  assert.equal(sys.role, "system");
  assert.match(sys.content, /JSON array only/);
  assert.match(user.content, /Today: 2026-10-30/);
  assert.match(user.content, /Existing topics: shop/);
  assert.match(user.content, /Last 60 min: x/);
  assert.match(user.content, /Open loops: y/);
});

test("parses a plain array, normalizes topic case, fills date and source", () => {
  const { entries, rejected } = parseEntries(JSON.stringify([good]), { date: "2026-10-30" });
  assert.equal(rejected.length, 0);
  assert.equal(entries[0].topic, "shop");
  assert.equal(entries[0].date, "2026-10-30");
  assert.equal(entries[0].source, "distill");
});

test("strips reasoning blocks and code fences", () => {
  const reply = "<think>the user was on github</think>\n```json\n" + JSON.stringify([good]) + "\n```";
  assert.equal(parseEntries(reply, { date: "2026-10-30" }).entries.length, 1);
});

test("an empty array means nothing worth keeping", () => {
  assert.deepEqual(parseEntries("[]", { date: "2026-10-30" }), { entries: [], rejected: [] });
});

test("invalid items are rejected with reasons; valid ones survive", () => {
  const { entries, rejected } = parseEntries(JSON.stringify([good, { ...good, kind: "idea" }, { title: "x" }]), {
    date: "2026-10-30",
  });
  assert.equal(entries.length, 1);
  assert.equal(rejected.length, 2);
  assert.match(rejected[0].errors.join(";"), /kind/);
});

test("caps the number of entries", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ ...good, title: `Entry number ${i}` }));
  assert.equal(parseEntries(JSON.stringify(many), { date: "2026-10-30" }).entries.length, MAX_ENTRIES);
});

test("a reply without an array is an error", () => {
  assert.throws(() => extractJsonArray("Sorry, I can't help with that."), /no JSON array/);
});
