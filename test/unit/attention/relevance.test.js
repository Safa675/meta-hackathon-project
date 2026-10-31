import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, withOverrides } from "../../../src/attention/config.js";
import {
  hostOf,
  normalizeTitle,
  relevanceKey,
  labelKeys,
  builtinLabel,
  isUnsure,
  cacheUsable,
} from "../../../src/attention/relevance.js";

test("normalizeTitle drops notification counters, extra spaces and case", () => {
  assert.equal(normalizeTitle("(3) Inbox  - Gmail "), "inbox - gmail");
  assert.equal(normalizeTitle("x".repeat(200)).length, 120);
});

test("hostOf strips www and survives garbage", () => {
  assert.equal(hostOf("https://WWW.YouTube.com/watch?v=a"), "youtube.com");
  assert.equal(hostOf("not a url"), "");
});

test("relevanceKey ties the goal, the host and the normalized title", () => {
  assert.equal(relevanceKey("i1", "https://www.youtube.com/watch?v=a", "Top 10 F1"), "i1|youtube.com|top 10 f1");
});

test("labelKeys are title-specific only on title-sensitive hosts", () => {
  assert.deepEqual(labelKeys("focus", "https://youtube.com/watch", "React hooks"), [
    "focus|youtube.com|react hooks",
    "focus|youtube.com",
  ]);
  assert.deepEqual(labelKeys("focus", "https://github.com/acme/shop", "x"), ["focus|github.com"]);
});

test("builtinLabel marks in-between stops as neutral", () => {
  for (const url of [
    "",
    "about:blank",
    "chrome://newtab/",
    "chrome-extension://abc/options.html",
    "https://www.google.com/search?q=x",
    "https://www.bing.com/search?q=x",
    "https://duckduckgo.com/?q=x",
    "https://calendar.google.com/calendar/u/0/r",
  ]) {
    assert.equal(builtinLabel(url), "neutral", url);
  }
  assert.equal(builtinLabel("https://github.com/x"), null);
  assert.equal(builtinLabel("https://www.google.com/maps"), null);
});

test("isUnsure is a low-confidence unrelated only", () => {
  assert.equal(isUnsure({ label: "unrelated", confidence: 0.5 }, DEFAULTS), true);
  assert.equal(isUnsure({ label: "unrelated", confidence: 0.6 }, DEFAULTS), false);
  assert.equal(isUnsure({ label: "neutral", confidence: 0.1 }, DEFAULTS), false);
});

test("withOverrides merges known keys only", () => {
  const cfg = withOverrides({ toleranceSec: 3, bogus: 1 });
  assert.equal(cfg.toleranceSec, 3);
  assert.equal(cfg.decayRate, DEFAULTS.decayRate);
  assert.equal("bogus" in cfg, false);
  assert.equal(withOverrides().toleranceSec, 45);
});

test("minor 8: a fallback answer is cached briefly, a model answer for good", () => {
  const now = Date.UTC(2026, 9, 31, 10, 0);
  assert.equal(cacheUsable({ source: "llm", ts: now - 86400000 }, now), true);
  assert.equal(cacheUsable({ source: "fallback", ts: now - 60 * 1000 }, now), true);
  assert.equal(cacheUsable({ source: "fallback", ts: now - 3 * 60 * 1000 }, now), false);
  assert.equal(cacheUsable(undefined, now), false);
});
