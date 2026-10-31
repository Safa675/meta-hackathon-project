import test from "node:test";
import assert from "node:assert/strict";
import { loadBrain, openLoops, fromLogMarkdown } from "../memory/brain.js";

// Synthetic fixtures only. No real brain content in this repo.
const logNote = `---
type: note
title: "Pick a vendor for the widget"
kind: decision
topic: demo-project
date: 2026-10-13
source: claude-code
host: laptop
id: abc123
---

# Pick a vendor for the widget

- **Date:** 2026-10-13 · **Topic:** demo-project · **Kind:** decision
- **Context:** Two vendors were quoted.
- **Decision/Result:** Vendor A, cheaper and faster.
- **Evidence:** quote.pdf
- **Next action:** Sign the contract by Friday.
`;

const inboxNote = `---
kind: todo
topic: demo-project
title: "Email the vendor"
date: 2026-10-14
source: claude-code
host: laptop
---
Context: Contract needs a countersignature.
Decision/Result: Send the signed copy.
Evidence: none
Next action: none
`;

test("parses the notes/log format", () => {
  const e = fromLogMarkdown(logNote);
  assert.equal(e.title, "Pick a vendor for the widget");
  assert.equal(e.next, "Sign the contract by Friday.");
  assert.equal(e.id, "abc123");
});

test("loads log, inbox and free-form notes; skips _done, README and bad files", () => {
  const { entries, documents, skipped } = loadBrain([
    { path: "notes/log/2026/a.md", text: logNote },
    { path: "inbox/b.md", text: inboxNote },
    { path: "inbox/_done/2026-10/b.md", text: inboxNote },
    { path: "inbox/README.md", text: "# inbox" },
    { path: "inbox/broken.md", text: "no frontmatter here" },
    { path: "notes/topics/any.md", text: "# Any topic\nbody" },
    { path: "notes/personal/also-included.md", text: "# Personal\nbody" },
    { path: "skills/x.md", text: "# not under notes" },
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-10-14"); // newest first
  assert.equal(documents.length, 2); // nothing excluded by topic or folder
  assert.deepEqual(
    skipped.map((s) => s.path),
    ["inbox/broken.md"],
  );
});

test("the same entry in inbox and log is counted once", () => {
  const pendingCopy = inboxNote
    .replace("Email the vendor", "Pick a vendor for the widget")
    .replace("2026-10-14", "2026-10-13");
  for (const files of [
    [
      { path: "notes/log/2026/a.md", text: logNote },
      { path: "inbox/a.md", text: pendingCopy },
    ],
    [
      { path: "inbox/a.md", text: pendingCopy },
      { path: "notes/log/2026/a.md", text: logNote },
    ],
  ]) {
    const { entries } = loadBrain(files);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, "notes/log/2026/a.md"); // log copy wins either way
  }
});

test("open loops are entries with a next action", () => {
  const { entries } = loadBrain([
    { path: "notes/log/2026/a.md", text: logNote },
    { path: "inbox/b.md", text: inboxNote },
  ]);
  assert.deepEqual(
    openLoops(entries).map((e) => e.title),
    ["Pick a vendor for the widget"],
  );
});
