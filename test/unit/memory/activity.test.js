import test from "node:test";
import assert from "node:assert/strict";
import { toSpans, clipSpans, summarize, renderSummary, hostOf, IDLE_GAP } from "../../../src/memory/activity.js";

const M = 60 * 1000;
const t0 = Date.UTC(2026, 9, 30, 10, 0);
const ev = (min, url, title, kind = "focus") => ({ ts: t0 + min * M, url, title, kind });

test("an event lasts until the next one", () => {
  const spans = toSpans(
    [ev(0, "https://github.com/x", "Repo"), ev(10, "https://www.youtube.com/watch", "Video")],
    t0 + 25 * M,
  );
  assert.deepEqual(
    spans.map((s) => [s.host, s.ms / M]),
    [
      ["github.com", 10],
      ["youtube.com", 15],
    ],
  );
});

test("a silence longer than the idle gap is time away, not time on the page", () => {
  const [s] = toSpans([ev(0, "https://github.com/x", "Repo")], t0 + 60 * M);
  assert.equal(s.ms, IDLE_GAP);
});

test("idle events end the span and add no time", () => {
  const spans = toSpans(
    [ev(0, "https://a.com", "A"), ev(3, "", "", "idle"), ev(20, "https://b.com", "B")],
    t0 + 22 * M,
  );
  assert.deepEqual(
    spans.map((s) => [s.host, s.ms / M]),
    [
      ["a.com", 3],
      ["b.com", 2],
    ],
  );
});

test("back-to-back events on one page merge, keeping the newest title", () => {
  const spans = toSpans([ev(0, "https://a.com/p", "Old"), ev(2, "https://a.com/p", "New")], t0 + 5 * M);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].ms, 5 * M);
  assert.equal(spans[0].title, "New");
});

test("clipping keeps only the part inside the window", () => {
  const spans = clipSpans(toSpans([ev(0, "https://a.com", "A")], t0 + 4 * M), t0 + 3 * M);
  assert.equal(spans[0].ms, 1 * M);
  assert.equal(spans[0].start, t0 + 3 * M);
});

test("summary groups by site, biggest first, and renders minutes", () => {
  const spans = toSpans(
    [
      ev(0, "https://github.com/a", "PR 12"),
      ev(5, "https://youtube.com/w", "Lofi"),
      ev(25, "https://github.com/b", "PR 13"),
    ],
    t0 + 30 * M,
  );
  const s = summarize(spans);
  assert.deepEqual(
    s.sites.map((x) => [x.host, x.ms / M]),
    [
      ["youtube.com", 20],
      ["github.com", 10],
    ],
  );
  assert.equal(s.totalMs, 30 * M);
  const text = renderSummary(s, 40 * M);
  assert.match(text, /^Last 40 min \(30 min active\):/);
  assert.match(text, /- youtube\.com: 20 min \("Lofi"\)/);
  assert.equal(renderSummary(summarize([]), 60 * M), "Last 60 min: no browser activity.");
});

test("hostOf strips www and tolerates bad URLs", () => {
  assert.equal(hostOf("https://www.youtube.com/x"), "youtube.com");
  assert.equal(hostOf("chrome://newtab"), "newtab");
  assert.equal(hostOf("nope"), "");
});
