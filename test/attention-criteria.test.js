// INTENT.md success criteria on recorded sessions. Every test/fixtures/<name>.log.json
// (an exported event log) with its <name>.labels.json ({onTask: [{start, end}],
// drifts: [{start, end}]}, ms timestamps marked by the person who recorded it)
// gets these tests. With no recording yet there are none: see docs/guides/testing.md.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { replay } from "../attention/replay.js";
import { DEFAULTS } from "../attention/config.js";

const dir = path.join(import.meta.dirname, "fixtures");
const H = 3600 * 1000;
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const inside = (ts, windows) => windows.some((w) => ts >= w.start && ts <= w.end);

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".log.json"))) {
  const name = file.replace(/\.log\.json$/, "");
  const log = read(file);
  const labels = read(`${name}.labels.json`);

  test(`${name}: no unfair warnings (≤ 1 L2+ per on-task hour)`, () => {
    const loud = replay(log).triggers.filter((t) => t.level >= 2 && !t.suppressedBy && inside(t.ts, labels.onTask));
    const hours = labels.onTask.reduce((a, w) => a + (w.end - w.start), 0) / H;
    assert.ok(loud.length <= Math.max(1, hours), `${loud.length} loud triggers in ${hours.toFixed(2)} on-task hours`);
  });

  test(`${name}: every drift is caught within tolerance + 5 s`, () => {
    const drifts = replay(log).triggers.filter((t) => t.kind === "drift");
    for (const w of labels.drifts.filter((w) => w.end - w.start > DEFAULTS.toleranceSec * 1000)) {
      const deadline = w.start + DEFAULTS.toleranceSec * 1000 + 5000;
      assert.ok(
        drifts.some((t) => t.ts >= w.start && t.ts <= deadline),
        `drift at ${new Date(w.start).toISOString()} not caught by ${new Date(deadline).toISOString()}`,
      );
    }
  });

  test(`${name}: replay is deterministic`, () => {
    assert.deepEqual(replay(log), replay(log));
  });
}
