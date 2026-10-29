import test from "node:test";
import assert from "node:assert/strict";
import { makeEntry, toInboxMarkdown, fromInboxMarkdown } from "../src/entry.js";

const sample = {
  kind: "decision",
  topic: "meta-hackathon",
  title: "Use chrome.storage.local for entries",
  context: "Choosing where the extension keeps its memory.",
  result: "chrome.storage.local, exported as inbox files.",
  evidence: "MV3 docs",
  next: "Wire the popup",
  date: "2026-10-29",
};

test("round-trips through the inbox markdown format", () => {
  const e = makeEntry(sample);
  assert.deepEqual(fromInboxMarkdown(toInboxMarkdown(e)), e);
});

test("omitted evidence/next are stored as none, like brain add", () => {
  const e = makeEntry({ ...sample, evidence: undefined, next: undefined });
  assert.equal(e.evidence, "none");
  assert.equal(e.next, "none");
});

test("rejects what brain add would reject", () => {
  assert.throws(() => makeEntry({ ...sample, kind: "idea" }));
  assert.throws(() => makeEntry({ ...sample, topic: "Bad Topic" }));
  assert.throws(() => makeEntry({ ...sample, title: "hi" }));
  assert.throws(() => makeEntry({ ...sample, date: "29/10/2026" }));
});
