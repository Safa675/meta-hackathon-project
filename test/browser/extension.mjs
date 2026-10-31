// End-to-end: the real extension in Chromium against a local fake model.
// Goal from the popup → related page → unrelated page → drift trigger, badge and
// popup card → "Take me back" (also when the related tab was closed) → "This is
// for my task" silences that page → the exported event log holds it all.
// Saves screenshots of the popup and settings page to SCREENSHOT_DIR when set.
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
// calls the video unrelated and everything else related.
const calls = [];
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  const page = (title) =>
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<title>${title}</title><p>${title}`);
  if (req.url === "/repo") return page("cart.js · acme/shop");
  if (req.url === "/video") return page("Top 10 F1 crashes - Video");
  if (req.url !== "/v1/chat/completions") return res.writeHead(404).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages } = JSON.parse(body);
    calls.push(messages);
    const reply = /Top 10 F1 crashes/.test(messages.at(-1).content)
      ? { label: "unrelated", confidence: 0.9, reason: "An F1 video, not the checkout bug." }
      : { label: "related", confidence: 0.9, reason: "The shop repo." };
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

// Settings: the fake model, and short timings so the test runs in seconds. The test
// hops between tabs to reach the popup, so fragmentation (unit-tested) is off here.
// Chrome's idle state is the machine's: the test must not depend on someone typing.
const settingsPage = await ctx.newPage();
watch(settingsPage);
await settingsPage.goto(`${ext}/extension/options/options.html`);
await settingsPage.evaluate(async (baseUrl) => {
  const { saveModelSettings } = await import("/memory/model.js");
  await saveModelSettings({ provider: "meta", baseUrl, model: "fake", apiKey: "test-key" });
  await chrome.storage.local.set({
    attentionConfig: { toleranceSec: 3, escalateAfterSec: 4, fragMinSwitches: 1000, idleAfterSec: 86400 },
  });
}, `http://127.0.0.1:${port}/v1`);

// Getting started on the page: the settings page took the day's first look (Tuck
// cannot appear there), so Tuck greets on the first normal page and asks for the goal.
const repoTab = await ctx.newPage();
await repoTab.goto(repo);
const tuck = repoTab.locator("#tuck-companion");
await tuck.locator(".bubble input[name=goal]").waitFor({ timeout: 10000 });
const greeting = await tuck.locator(".bubble .text").textContent();
const greetState = await tuck.locator("svg.tuck").getAttribute("data-state");
if (shots) await repoTab.screenshot({ path: path.join(shots, "tuck-greeting.png") });
// Drag Tuck to the left: the bubble then opens rightwards.
await repoTab.waitForTimeout(600); // the slide-in
const box = await tuck.locator(".avatar").boundingBox();
await repoTab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await repoTab.mouse.down();
await repoTab.mouse.move(60, 120, { steps: 8 });
await repoTab.mouse.up();
const dragged = await tuck.locator(".avatar").boundingBox();
const bubbleAfterDrag = await tuck.locator(".bubble").boundingBox();
const formStillOpen = await tuck.locator("input[name=goal]").isVisible();
if (shots) await repoTab.screenshot({ path: path.join(shots, "tuck-dragged-left.png") });
await tuck.locator("input[name=goal]").fill("Fix the checkout bug");
await tuck.locator("input[name=step]").fill("Write the failing test");
await tuck.locator("button.start").click();
await tuck.locator(".bubble .text", { hasText: "Got it" }).waitFor();
// Tuck stays, resting; a click is a check-in wave with the goal card.
await repoTab.waitForTimeout(2500);
const restState = await tuck.locator("svg.tuck").getAttribute("data-state");
await tuck.locator(".avatar").click();
await tuck.locator(".bubble .text", { hasText: "Fix the checkout bug" }).waitFor();
const clickState = await tuck.locator("svg.tuck").getAttribute("data-state");
await tuck.locator(".bubble .close").click();
await repoTab.waitForTimeout(1500);

// The popup (opened as a tab) shows the goal set on the page.
const popup = await ctx.newPage();
watch(popup);
await popup.goto(`${ext}/extension/popup/popup.html`);
await popup.waitForSelector("#intent-view:not([hidden])");
const intentShown = await popup.textContent("#intent-title");

// Poll from node: extension pages forbid the eval that waitForFunction polling uses.
const lastTrigger = () => popup.evaluate(async () => (await chrome.storage.local.get("lastTrigger")).lastTrigger);
async function waitForNewDrift(afterId) {
  for (let i = 0; i < 60; i++) {
    const t = await lastTrigger();
    if (t?.kind === "drift" && t.id !== afterId && !t.respondedAt) return t;
    await popup.waitForTimeout(250);
  }
  throw new Error(`no new drift trigger after ${afterId}`);
}
const activeUrl = () =>
  popup.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url);
async function clickOnCard(button) {
  await popup.bringToFront();
  await popup.reload();
  await popup.waitForSelector("#trigger:not([hidden])");
  const text = await popup.textContent("#trigger-text");
  await popup.click(button);
  await popup.waitForTimeout(500);
  return text;
}

// Browse: the repo, then the video. The model judges each page once.
await repoTab.bringToFront();
await repoTab.waitForTimeout(1500);
const videoTab = await ctx.newPage();
await videoTab.goto(video);
await videoTab.bringToFront();
const drift1 = await waitForNewDrift(null);
const badge = await popup.evaluate(() => chrome.action.getBadgeText({}));
// Tuck on the video speaks at the first detection (L1): a check-in wave with the
// message. Still drifting, it turns to thinking (L2).
const onVideo = videoTab.locator("#tuck-companion");
await onVideo.locator(".bubble button[data-choice=back]").waitFor({ timeout: 2500 });
const firstState = await onVideo.locator("svg.tuck").getAttribute("data-state");
const firstText = await onVideo.locator(".bubble .text").textContent();
for (let i = 0; i < 40 && (await onVideo.locator("svg.tuck").getAttribute("data-state")) !== "thinking"; i++)
  await videoTab.waitForTimeout(250);
const nudgeState = await onVideo.locator("svg.tuck").getAttribute("data-state");
const videoAvatar = await onVideo.locator(".avatar").boundingBox();
const cardText = await onVideo.locator(".bubble .text").textContent();
if (shots) await videoTab.screenshot({ path: path.join(shots, "tuck-nudge.png") });
await onVideo.locator(".bubble button[data-choice=back]").click();
await popup.waitForTimeout(800);
if (shots) await popup.screenshot({ path: path.join(shots, "popup-trigger.png"), fullPage: true });
const backTo = await activeUrl();

// The related tab is gone: "Take me back" reopens its page.
await videoTab.bringToFront();
const drift2 = await waitForNewDrift(drift1.id);
await repoTab.close();
await clickOnCard("#take-me-back");
const reopened = await activeUrl();

// Review C1: Chrome restarts (session storage is wiped); the goal must still be watched.
await popup.evaluate(() => chrome.storage.session.clear());
await videoTab.bringToFront();
const drift4 = await waitForNewDrift(drift2.id);
await clickOnCard("#take-me-back");
const backAfterRestart = await activeUrl();

// Minor 6: going back to work on your own clears the nudge.
await videoTab.bringToFront();
const drift5 = await waitForNewDrift(drift4.id);
await ctx
  .pages()
  .find((p) => p.url() === repo)
  .bringToFront();
await popup.waitForTimeout(1500);
const selfReturn = await lastTrigger();
await popup.reload();
const cardAfterSelfReturn = await popup.isVisible("#trigger");

// "This is for my task" on the video: the next visit stays quiet.
await videoTab.bringToFront();
const drift3 = await waitForNewDrift(drift5.id);
await clickOnCard("#for-my-task");
await videoTab.bringToFront();
await videoTab.waitForTimeout(6000);
const afterLabel = await lastTrigger();

// Review I1: changing the goal closes the old one; Done leaves no goal behind.
await popup.evaluate(() => chrome.runtime.sendMessage({ type: "set-intent", title: "Write the demo script" }));
await popup.evaluate(() => chrome.runtime.sendMessage({ type: "complete-intent" }));
const afterDone = await popup.evaluate(() => chrome.runtime.sendMessage({ type: "get-status" }));

// The exported event log.
await settingsPage.bringToFront();
const log = await settingsPage.evaluate(() => chrome.runtime.sendMessage({ type: "export-log" }));
const types = new Set(log.events.map((e) => e.type));
if (shots) {
  await settingsPage.reload();
  await settingsPage.waitForTimeout(500);
  await settingsPage.screenshot({ path: path.join(shots, "settings.png"), fullPage: true });
}

await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });

assert.deepEqual(errors, []);
assert.equal(greeting, "Hi! What are we working on today?");
assert.equal(greetState, "checkin");
assert.equal(restState, "resting", "Tuck rests on the page once the goal is set");
assert.equal(clickState, "checkin", "clicking Tuck is a check-in");
assert.ok(dragged.x < 100, `dragged to the left: ${dragged.x}`);
assert.ok(bubbleAfterDrag.x >= dragged.x, "on the left, the bubble opens rightwards");
assert.ok(formStillOpen, "a drag is not a click");
assert.ok(videoAvatar.x < 100, `Tuck remembers where it was put: ${videoAvatar.x}`);
assert.equal(intentShown, "Fix the checkout bug");
assert.equal(drift1.level, 1);
assert.equal(firstState, "checkin", "the first detection is a visible wave");
assert.match(firstText, /You've been on localhost/, "the first detection already says something");
assert.equal(nudgeState, "thinking");
assert.match(calls[0].at(-1).content, /Goal: Fix the checkout bug/);
const videoCalls = calls.filter((m) => /Top 10 F1 crashes/.test(m.at(-1).content)).length;
assert.equal(videoCalls, 1, `the video is judged once, then cached (${videoCalls} calls)`);
assert.ok(["·", "!"].includes(badge), `badge: ${badge}`);
assert.match(cardText, /localhost/);
assert.match(cardText, /Fix the checkout bug/);
assert.equal(backTo, repo);
assert.equal(reopened, repo);
assert.equal(afterLabel.id, drift3.id, "no new trigger on a page marked as work");
assert.equal(afterLabel.choice, "related");
assert.equal(drift4.kind, "drift", "drift is still caught after a restart");
assert.equal(backAfterRestart, repo, "Take me back still works after a restart");
assert.equal(afterDone.intent, null, "no stale goal after change + done");
assert.equal(selfReturn.id, drift5.id);
assert.equal(selfReturn.resolvedBy, "self", "a drift ends on its own when you go back to work");
assert.equal(cardAfterSelfReturn, false, "no stale card in the popup");
for (const t of ["context", "relevance", "llm", "state", "trigger", "response", "feedback", "session"])
  assert.ok(types.has(t), `log has ${t}: ${[...types]}`);
assert.ok(!log.events.some((e) => String(e.url ?? "").startsWith("chrome-extension:")), "no extension URLs in the log");
console.log("extension e2e: ok");
