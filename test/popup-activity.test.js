import test from "node:test";
import assert from "node:assert/strict";
import { activityRows } from "../extension/popup/activity.js";

const M = 60 * 1000;
const span = (url, title, min) => ({ url, title, ms: min * M, host: new URL(url).hostname.replace(/^www\./, "") });

test("activity rows: browser pages are dropped, sites grouped and sorted, times readable", () => {
  const rows = activityRows([
    span("chrome://newtab/", "New Tab", 1),
    span("chrome://extensions/", "Extensions", 0.2),
    span("https://dev.meta.ai/docs", "Model API", 0.3),
    span("https://github.com/acme/shop", "cart.js", 4),
    span("https://github.com/acme/shop/pull/1", "Fix cart", 2),
    span("https://www.youtube.com/watch?v=a", "Top 10 F1 crashes", 3),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.site, r.time, r.title]),
    [
      ["github.com", "6 min", "cart.js"],
      ["youtube.com", "3 min", "Top 10 F1 crashes"],
      ["dev.meta.ai", "<1 min", "Model API"],
    ],
  );
  assert.equal(rows[0].share, 1);
  assert.equal(rows[1].share, 0.5);
});

test("activity rows: nothing browsed yet is an empty list", () => {
  assert.deepEqual(activityRows([span("chrome://newtab/", "New Tab", 2)]), []);
});
