import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, makeIntent, isExpired } from "../attention/intents.js";
import { DEFAULTS } from "../attention/config.js";

const IST = -180; // Istanbul, UTC+3, as getTimezoneOffset() reports it
const H = 3600 * 1000;
const at = (iso) => Date.parse(iso); // UTC instants
const created = at("2026-10-31T20:00:00Z"); // 23:00 in Istanbul

test("the day turns at 04:00 local time", () => {
  assert.equal(dayKey(at("2026-11-01T00:30:00Z"), DEFAULTS, IST), "2026-10-31"); // 03:30 local
  assert.equal(dayKey(at("2026-11-01T01:01:00Z"), DEFAULTS, IST), "2026-11-01"); // 04:01 local
});

test("a goal from late last night is still active before 04:00", () => {
  const intent = makeIntent({ title: "Edit the demo video" }, created);
  const now = at("2026-11-01T00:30:00Z");
  assert.equal(isExpired(intent, now, now, DEFAULTS, IST), false);
});

test("a goal expires on the first focus of a new day", () => {
  const intent = makeIntent({ title: "Edit the demo video" }, created);
  const now = at("2026-11-01T01:01:00Z");
  assert.equal(isExpired(intent, now, now, DEFAULTS, IST), true);
});

test("a goal expires after six hours away", () => {
  const intent = makeIntent({ title: "Edit the demo video" }, at("2026-11-01T06:00:00Z"));
  const now = at("2026-11-01T13:00:00Z");
  assert.equal(isExpired(intent, now, now - 7 * H, DEFAULTS, IST), true);
  assert.equal(isExpired(intent, now, now - 5 * H, DEFAULTS, IST), false);
});

test("makeIntent fills the shadow record", () => {
  const intent = makeIntent({ title: "Edit the demo video", steps: ["Cut the intro"] }, created, "id-1");
  assert.deepEqual(intent, {
    id: "id-1",
    title: "Edit the demo video",
    steps: ["Cut the intro"],
    estMin: null,
    topic: "edit-the-demo-video",
    createdAt: created,
    doneAt: null,
    expiredAt: null,
    memoryEntryId: null,
    fromLoopId: null,
  });
  assert.equal(
    makeIntent({ title: "SUT kural motorundaki kırık testleri düzelt" }, created).topic,
    "sut-kural-motorundaki-kirik-testleri-duz",
  );
  assert.equal(typeof makeIntent({ title: "x y z" }, created).id, "string");
});
