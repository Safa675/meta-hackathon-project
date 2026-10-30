// Loads the unpacked extension in Chromium and drives the Memory API from an
// extension page: IndexedDB, import, add, consolidate, recall, context pack,
// activity, distill (fake model), and the brain connector. The brain folder is
// an origin-private file system directory, because a test cannot click the
// folder picker; the background worker then re-syncs it from the stored handle.
// Needs Playwright with a Chromium build: `npm run test:browser`.
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = path.resolve(import.meta.dirname, "../..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ext-profile-"));

// Extensions need Chromium's new headless mode, passed as a flag.
const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--headless=new", `--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
let [worker] = ctx.serviceWorkers();
worker ??= await ctx.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`chrome-extension://${id}/extension/popup/popup.html`);

const result = await page.evaluate(async () => {
  const { Memory } = await import("/memory/index.js");
  const m = await Memory.open("browser-test");
  const log = `---\ntype: note\ntitle: "Ship the pricing page"\nkind: decision\ntopic: shop\ndate: 2026-10-10\nsource: claude-code\nhost: laptop\nid: aaaaaaaaaa\n---\n\n# Ship the pricing page\n\n- **Context:** Old page converts badly.\n- **Decision/Result:** New layout.\n- **Evidence:** none\n- **Next action:** Ship it by Friday.\n`;
  const imported = await m.importFiles([
    { path: "notes/log/2026/a.md", text: log },
    { path: "notes/topics/shop.md", text: "# Shop\nCheckout lives in the shop repo." },
  ]);
  const added = await m.add({ kind: "todo", topic: "shop", title: "Fix checkout bug", context: "Cart drops items.", result: "Fix checkout bug", next: "Write the failing test", evidence: "api_key=supersecretvalue1" });
  const cons = await m.consolidate();
  const again = await m.consolidate();
  const hits = (await m.recall("checkout")).map((h) => h.title);
  const loops = (await m.openLoops()).map((e) => e.title);
  const { prompt } = await m.contextPack({ title: "Checkout - Shop admin", url: "https://shop.example/checkout" });
  const filed = (await m.recall("checkout bug"))[0].item;
  return { imported, added: added.status, cons, again, hits, loops, prompt, filedEvidence: filed.evidence, filedStatus: filed.status };
});

const memory2 = await page.evaluate(async () => {
  const { Memory } = await import("/memory/index.js");
  const M = 60 * 1000;
  const now = Date.now();

  // Activity: three pages over 30 minutes, then idle.
  const a = await Memory.open("browser-test-2");
  await a.recordActivity({ url: "https://github.com/x/shop", title: "Fix checkout bug", ts: now - 30 * M });
  await a.recordActivity({ url: "https://www.youtube.com/watch", title: "Lofi", ts: now - 20 * M });
  await a.recordActivity({ url: "https://github.com/x/shop", title: "Fix checkout bug", ts: now - 5 * M });
  await a.recordActivity({ kind: "idle", ts: now - 1 * M });
  const act = await a.activity({ minutes: 60, now });

  // Distill with a fake model that returns one entry wrapped in a reasoning block.
  const fake = async (messages) => {
    if (!messages[1].content.includes("youtube.com: 15 min")) throw new Error("activity not in prompt");
    return '<think>x</think>[{"kind":"todo","topic":"shop","title":"Checkout bug fix in progress","context":"25 min on the shop repo.","result":"Bug located in cart.","evidence":"github.com 19 min","next":"Write the failing test"}]';
  };
  const distilled = await a.distill(fake, { now });
  const cons = await a.consolidate();

  // Brain connector on an OPFS folder that looks like a second-brain checkout.
  const root = await navigator.storage.getDirectory();
  const brain = await root.getDirectoryHandle("brain", { create: true });
  const write = async (dir, parts, text) => {
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(text);
    await w.close();
  };
  await write(brain, ["notes", "topics", "shop.md"], "# Shop\nCheckout notes.");
  await write(brain, ["skills", "ignored.md"], "# not read");
  const m = await Memory.open(); // default DB, shared with the background worker
  const connected = await m.connectBrain(brain);
  await m.add({ kind: "fact", topic: "shop", title: "Cart drops items on reload", context: "Seen in testing.", result: "Reproduced twice." });
  const maintained = await m.maintain();
  const inbox = await brain.getDirectoryHandle("inbox");
  const exportedFiles = [];
  for await (const [name, h] of inbox.entries()) exportedFiles.push({ name, text: await (await h.getFile()).text() });
  const again = await m.exportPending();
  return { spans: act.spans.length, text: act.text, distilled: distilled.added, cons, connected, maintained, exportedFiles, again };
});

// Background worker: re-import the brain from the handle stored in IndexedDB.
const synced = await page.evaluate(() => chrome.runtime.sendMessage({ type: "sync-brain" }));
const afterSync = await page.evaluate(async () => {
  const { Memory } = await import("/memory/index.js");
  const hits = await (await Memory.open()).recall("cart drops items reload");
  return hits.filter((h) => h.title === "Cart drops items on reload").map((h) => h.item.path ?? "own");
});

await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });

assert.deepEqual(errors, []);
assert.deepEqual(result.imported, { entries: 1, notes: 1, skipped: [] });
assert.equal(result.added, "inbox");
assert.deepEqual(result.cons, { accepted: 1, duplicates: 0, rejected: 0, redactions: 1 });
assert.equal(result.again.accepted, 0);
assert.equal(result.filedStatus, "log");
assert.equal(result.filedEvidence, "api_key=[REDACTED]");
assert.equal(result.hits[0], "Fix checkout bug");
assert.deepEqual(result.loops.sort(), ["Fix checkout bug", "Ship the pricing page"]);
assert.match(result.prompt, /Stated intent \(\d{4}-\d{2}-\d{2}\): Fix checkout bug/);
assert.equal(memory2.spans, 3);
assert.match(memory2.text, /^Last 60 min \(29 min active\):/);
assert.match(memory2.text, /github\.com: 14 min/);
assert.equal(memory2.distilled, 1);
assert.equal(memory2.cons.accepted, 1);
assert.deepEqual(memory2.connected, { entries: 0, notes: 1, skipped: [] });
assert.equal(memory2.maintained.consolidated.accepted, 1);
assert.equal(memory2.maintained.exported.exported, 1);
assert.equal(memory2.exportedFiles.length, 1);
assert.match(memory2.exportedFiles[0].name, /^\d{8}T\d{6}Z-browser-extension-[0-9a-f]{6}\.md$/);
assert.match(memory2.exportedFiles[0].text, /^---\nkind: fact\ntopic: shop\ntitle: "Cart drops items on reload"/);
assert.equal(memory2.again.exported, 0); // exported once only
assert.equal(synced.connected, true, `sync: ${JSON.stringify(synced)}`);
assert.equal(synced.entries, 1); // the exported entry came back from the brain inbox
assert.deepEqual(afterSync, [memory2.exportedFiles[0] && `inbox/${memory2.exportedFiles[0].name}`]); // once, as the brain copy
console.log("browser test: ok");
