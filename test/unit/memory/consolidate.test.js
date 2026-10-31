import test from "node:test";
import assert from "node:assert/strict";
import { consolidate, redact, entryId } from "../../../src/memory/consolidate.js";

const base = {
  kind: "decision",
  topic: "demo-project",
  title: "Pick a vendor for the widget",
  date: "2026-10-13",
  source: "extension",
  context: "Two vendors were quoted.",
  result: "Vendor A.",
  evidence: "none",
  next: "Sign by Friday.",
};

test("redacts secret-shaped strings and keeps the label", () => {
  const r = redact("key sk-abcdefghijklmnopqrstuv and api_key=hunter2hunter2 here");
  assert.equal(r.text, "key [REDACTED] and api_key=[REDACTED] here");
  assert.equal(r.count, 2);
});

test("accepts valid entries, gives them a stable id and log status", () => {
  const { accepted } = consolidate([base], []);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].status, "log");
  assert.equal(accepted[0].id, entryId(base));
});

test("an unchanged restatement is a no-op; a changed one is filed", () => {
  const [filed] = consolidate([base], []).accepted;
  const again = consolidate([base], [filed]);
  assert.equal(again.accepted.length, 0);
  assert.equal(again.duplicates.length, 1);
  const changed = consolidate([{ ...base, result: "Vendor B after all." }], [filed]);
  assert.equal(changed.accepted.length, 1);
  assert.notEqual(changed.accepted[0].id, filed.id);
});

test("rejects invalid entries with reasons", () => {
  const { rejected } = consolidate([{ ...base, kind: "idea" }], []);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].errors[0], /kind/);
});

test("redaction happens before filing", () => {
  const [e] = consolidate([{ ...base, evidence: "token: ghp_abcdefghijklmnopqrstuvwx" }], []).accepted;
  assert.equal(e.evidence, "token: [REDACTED]");
});
