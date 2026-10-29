// Loads the unpacked extension in Chromium and drives the Memory API from an
// extension page: IndexedDB, import, add, consolidate, recall, context pack.
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

// The background worker writes through the same API when the popup sends a message.
const viaWorker = await page.evaluate(() =>
  chrome.runtime.sendMessage({ type: "intent", title: "Write the demo script", next: "Record on Nov 3" }),
);

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
assert.equal(viaWorker.status, "inbox", `background worker: ${JSON.stringify(viaWorker)}`);
console.log("browser test: ok");
