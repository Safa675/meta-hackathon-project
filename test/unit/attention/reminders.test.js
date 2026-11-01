import test from "node:test";
import assert from "node:assert/strict";
import { pickReminder, sayable, stillOpen, markSaid, markDone } from "../../../src/attention/reminders.js";

const today = "2026-11-02";
const task = (id, daysLeft, title = id) => ({ id, title, daysLeft, due: daysLeft == null ? null : "x" });
const queue = [task("exam", 0), task("visa", 1), task("old", -30), task("undated", null), task("far", 9)];

test("the most urgent close task, not the goal the person is on", () => {
  assert.equal(pickReminder(queue, { today }).id, "exam");
  assert.equal(pickReminder(queue, { today, goalTitle: "exam" }).id, "visa");
});

test("only what is close: not far off, undated or long missed", () => {
  const rest = [task("old", -30), task("undated", null), task("far", 9)];
  assert.equal(pickReminder(rest, { today }), null);
  assert.equal(pickReminder([task("missed", -7)], { today }).id, "missed");
});

test("once a day: said today waits until tomorrow, for reminders and drift lines alike", () => {
  const loops = markSaid({}, "exam", today);
  assert.equal(pickReminder(queue, { today, loops }).id, "visa");
  assert.ok(!sayable(queue, loops, today).some((e) => e.id === "exam"));
  assert.equal(pickReminder(queue, { today: "2026-11-03", loops }).id, "exam");
});

test("done stays done, also in the Pick up list, and keeps what was said", () => {
  const loops = markDone(markSaid({}, "exam", today), "exam", 1);
  assert.deepEqual(loops.exam, { saidOn: today, doneAt: 1 });
  assert.equal(pickReminder(queue, { today: "2026-11-09", loops }).id, "visa");
  assert.ok(!stillOpen(queue, loops).some((e) => e.id === "exam"));
});

test("an entry with no id cannot be remembered, so it is not raised", () => {
  assert.equal(pickReminder([{ title: "x", daysLeft: 0 }], { today }), null);
});
