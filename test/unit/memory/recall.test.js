import test from "node:test";
import assert from "node:assert/strict";
import { fold, buildIndex, search, entryDoc, noteDoc } from "../../../src/memory/recall.js";
import { contextPack, renderPack } from "../../../src/memory/context.js";

const entries = [
  {
    id: "a",
    kind: "decision",
    topic: "shop",
    title: "Pricing page redesign",
    date: "2026-10-10",
    context: "Old page converts badly.",
    result: "New layout.",
    evidence: "none",
    next: "Ship the pricing page",
  },
  {
    id: "b",
    kind: "fact",
    topic: "health",
    title: "Gym schedule",
    date: "2026-10-11",
    context: "Three days a week.",
    result: "Mon Wed Fri.",
    evidence: "none",
    next: "none",
  },
  {
    id: "c",
    kind: "todo",
    source: "extension",
    topic: "shop",
    title: "Fix checkout bug",
    date: "2026-10-12",
    context: "Cart drops items.",
    result: "Fix checkout bug",
    evidence: "none",
    next: "Write the failing test",
    ts: 2,
  },
];
const notes = [
  {
    path: "notes/topics/shop.md",
    title: "Shop",
    text: "Checkout and pricing live in the shop repo. KESİNTİ notes too.",
  },
];
const index = buildIndex([...entries.map(entryDoc), ...notes.map(noteDoc)]);

test("folds Turkish dotted and dotless i and strips diacritics", () => {
  assert.equal(fold("İCP ıcp ICP"), "icp icp icp");
  assert.equal(fold("Kesinti KESİNTİ şğüçö"), "kesinti kesinti sguco");
});

test("ranks by relevance and boosts titles", () => {
  const hits = search(index, "checkout");
  assert.equal(hits[0].ref.id, "c");
  assert.ok(hits.some((h) => h.ref.type === "note"));
});

test("matches across Turkish casing", () => {
  assert.equal(search(index, "kesinti")[0].ref.path, "notes/topics/shop.md");
});

test("filter narrows before ranking", () => {
  const hits = search(index, "pricing", { filter: (d) => d.ref.type === "note" });
  assert.deepEqual(
    hits.map((h) => h.ref.type),
    ["note"],
  );
});

test("context pack: intent, related open loops, related notes", () => {
  const pack = contextPack(index, entries, { title: "Checkout - Shop admin", url: "https://shop.example/checkout" });
  assert.equal(pack.intent.id, "c");
  assert.deepEqual(pack.openLoops.map((e) => e.id).sort(), ["a", "c"]);
  assert.ok(!pack.openLoops.some((e) => e.id === "b"));
  const prompt = renderPack(pack);
  assert.match(prompt, /Stated intent \(2026-10-12\): Fix checkout bug/);
  assert.ok(renderPack(pack, { maxChars: 80 }).length <= 80);
});
