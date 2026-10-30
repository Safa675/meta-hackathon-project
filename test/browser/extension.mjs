// End-to-end: the real extension in Chromium against a local fake model.
// Tab capture → intent from the popup → "Check now" → drift verdict and badge →
// the audit alarm firing a notification → "Done". Saves screenshots of the popup
// and settings page to SCREENSHOT_DIR when set.
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = path.resolve(import.meta.dirname, "../..");
const shots = process.env.SCREENSHOT_DIR;

// Two "sites" (different hostnames for the same server) and a fake model that
// calls it drifting when the current page is the video.
const calls = [];
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  const page = (title) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<title>${title}</title><p>${title}`);
  if (req.url === "/repo") return page("cart.js · acme/shop");
  if (req.url === "/video") return page("Top 10 F1 crashes - Video");
  if (req.url !== "/v1/chat/completions") return res.writeHead(404).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages } = JSON.parse(body);
    calls.push(messages);
    const drifting = /Now: Top 10 F1 crashes/.test(messages[1].content);
    const reply = drifting
      ? { verdict: "drifting", confidence: 0.85, reason: "Most of the last minutes went to a video, not the checkout bug.", nudge: "Close the video and write the failing test." }
      : { verdict: "on_track", confidence: 0.9, reason: "Working in the shop repo.", nudge: "" };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const repo = `http://127.0.0.1:${port}/repo`;
const video = `http://localhost:${port}/video`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ext-e2e-"));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  viewport: { width: 420, height: 720 },
  args: ["--headless=new", `--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
let [worker] = ctx.serviceWorkers();
worker ??= await ctx.waitForEvent("serviceworker");
const ext = `chrome-extension://${new URL(worker.url()).host}`;
const errors = [];
const watch = (p) => p.on("pageerror", (e) => errors.push(String(e)));

// Settings: point the model at the fake server.
const settingsPage = await ctx.newPage();
watch(settingsPage);
await settingsPage.goto(`${ext}/extension/options/options.html`);
await settingsPage.evaluate(async (baseUrl) => {
  const { saveModelSettings } = await import("/memory/model.js");
  await saveModelSettings({ provider: "meta", baseUrl, model: "fake", apiKey: "test-key" });
}, `http://127.0.0.1:${port}/v1`);

// Popup (opened as a tab): no intent yet, so the form shows. Set one.
const popup = await ctx.newPage();
watch(popup);
await popup.goto(`${ext}/extension/popup/popup.html`);
await popup.waitForSelector("#intent-form:not([hidden])");
await popup.fill("#title", "Fix the checkout bug");
await popup.fill("#next", "Write the failing test");
await popup.click("#intent-form button[type=submit]");
await popup.waitForSelector("#intent-view:not([hidden])");
const intentShown = await popup.textContent("#intent-title");

// Browse: the repo, then the video. Tab capture records both.
const tab = await ctx.newPage();
await tab.goto(repo);
await tab.waitForTimeout(1200);
await tab.goto(video);
await tab.waitForTimeout(1200);

const activity = await popup.evaluate(async () => {
  const { Memory } = await import("/memory/index.js");
  const a = await (await Memory.open()).activity({ minutes: 30 });
  return a.spans.map((s) => s.title);
});

// "Check now" from the popup.
await popup.bringToFront();
await popup.click("#check");
await popup.waitForSelector("#verdict-pill.drifting, #verdict-pill.error", { timeout: 15000 });
const verdict = {
  pill: await popup.textContent("#verdict-pill"),
  nudge: await popup.textContent("#verdict-nudge"),
  badge: await popup.evaluate(() => chrome.action.getBadgeText({})),
};
const auditPrompt = calls.at(-1)?.[1].content ?? "";
if (shots) await popup.screenshot({ path: path.join(shots, "popup-drifting.png"), fullPage: true });

// A manual check never notifies; the timer does. Fire the audit alarm now.
const before = await popup.evaluate(() => chrome.notifications.getAll());
await popup.evaluate(() => chrome.alarms.create("audit", { when: Date.now() + 500 }));
// Poll from node: extension pages forbid the eval that waitForFunction polling uses.
let after = {};
for (let i = 0; i < 50 && !Object.keys(after).length; i++) {
  await popup.waitForTimeout(300);
  after = await popup.evaluate(() => chrome.notifications.getAll());
}

// Done: the intent clears and the form comes back.
await popup.click("#done");
await popup.waitForSelector("#intent-form:not([hidden])");
const doneEvent = await popup.evaluate(async () => {
  const { Memory } = await import("/memory/index.js");
  const hits = await (await Memory.open()).recall("Done Fix the checkout bug");
  return hits.map((h) => h.title);
});

if (shots) {
  await settingsPage.bringToFront();
  await settingsPage.reload();
  await settingsPage.waitForTimeout(500);
  await settingsPage.screenshot({ path: path.join(shots, "settings.png"), fullPage: true });
}

await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });

assert.deepEqual(errors, []);
assert.equal(intentShown, "Fix the checkout bug");
assert.ok(activity.includes("cart.js · acme/shop") && activity.includes("Top 10 F1 crashes - Video"), `activity: ${activity}`);
assert.match(auditPrompt, /Stated intent \(\d{4}-\d{2}-\d{2}\): Fix the checkout bug; next: Write the failing test/);
assert.match(auditPrompt, /localhost: (<1|\d+) min/);
assert.match(auditPrompt, /Now: Top 10 F1 crashes/);
assert.doesNotMatch(auditPrompt, /chrome-extension:|about:blank/);
assert.equal(verdict.pill, "Drifting");
assert.equal(verdict.nudge, "Close the video and write the failing test.");
assert.equal(verdict.badge, "!");
assert.deepEqual(before, {});
assert.ok("drift" in after, `notifications: ${JSON.stringify(after)}`);
assert.ok(doneEvent.includes("Done: Fix the checkout bug"), `done: ${doneEvent}`);
console.log("extension e2e: ok");
