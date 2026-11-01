import test from "node:test";
import assert from "node:assert/strict";
import { taskQueue, contextPack, renderPack } from "../../../src/memory/context.js";
import { buildIndex, entryDoc } from "../../../src/memory/recall.js";

const TODAY = "2026-11-01";

const entry = (over) => ({
  kind: "todo",
  topic: "bilun",
  date: "2026-10-30",
  source: "brain",
  context: "c",
  result: "r",
  evidence: "none",
  next: "do the thing",
  ...over,
});

const entries = [
  entry({ id: "a", title: "Bootcamp application", result: "deadline is 2026-11-09", next: "Fill in the form" }),
  entry({ id: "b", title: "Hackathon submission", result: "due 2026-11-04", next: "Record the demo" }),
  entry({ id: "c", title: "Read the SUT catalogue", next: "Skim chapter 2" }),
  entry({ id: "d", title: "Already filed", next: "none" }),
];

test("the queue puts the nearest deadline first and the undated loops last", () => {
  const q = taskQueue(entries, { today: TODAY });
  assert.deepEqual(
    q.map((e) => e.id),
    ["b", "a", "c"],
  );
  assert.equal(q[0].due, "2026-11-04");
  assert.equal(q[0].daysLeft, 3);
  assert.equal(q[2].due, null);
});

test("an entry with no next action is not a task", () => {
  assert.equal(
    taskQueue(entries, { today: TODAY }).some((e) => e.id === "d"),
    false,
  );
});

test("the queue respects its limit", () => {
  assert.equal(taskQueue(entries, { today: TODAY, limit: 2 }).length, 2);
});

test("the rendered pack states the days left and does not repeat a task", () => {
  const index = buildIndex(entries.map(entryDoc));
  const pack = contextPack(
    index,
    entries,
    { title: "Bootcamp", url: "https://teknoparkizmir.com.tr" },
    { today: TODAY },
  );
  const text = renderPack(pack);

  assert.match(text, /Deadlines:/);
  assert.match(text, /Hackathon submission → due 2026-11-04 \(in 3 days\)/);
  assert.equal(text.match(/Hackathon submission/g).length, 1, "a dated task is listed once, not in both sections");
});

test("no deadlines anywhere means no Deadlines section", () => {
  const plain = [entry({ id: "c", title: "Read the SUT catalogue", next: "Skim chapter 2" })];
  const index = buildIndex(plain.map(entryDoc));
  const pack = contextPack(index, plain, { title: "x", url: "https://example.com" }, { today: TODAY });
  assert.doesNotMatch(renderPack(pack), /Deadlines:/);
});

test("a deadline long past sinks below the live tasks instead of holding the top", () => {
  const old = entry({ id: "old", title: "Hasat 2026 application", result: "deadline 2025-06-01", date: "2025-05-01" });
  const q = taskQueue([old, ...entries], { today: TODAY });
  assert.equal(q[0].id, "b", "the nearest live deadline still leads");
  assert.equal(q.at(-1).id, "old", "a year-old deadline comes last, and is not dropped");
});
