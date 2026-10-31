import test from "node:test";
import assert from "node:assert/strict";
// layout.js is a classic content script: it defines globalThis.tuckLayout.
await import("../../../src/tuck/layout.js");
const { placement, clamp } = globalThis.tuckLayout;

const view = { width: 1200, height: 800 };
const avatar = (x, y) => ({ x, y, width: 72, height: 72 });

test("on the right half the bubble opens leftwards, below Tuck", () => {
  assert.deepEqual(placement(avatar(1100, 16), view), { side: "left", vertical: "below" });
});

test("dragged to the left half, the bubble opens rightwards", () => {
  assert.deepEqual(placement(avatar(20, 16), view), { side: "right", vertical: "below" });
});

test("in the bottom half the bubble opens above Tuck", () => {
  assert.deepEqual(placement(avatar(20, 700), view), { side: "right", vertical: "above" });
  assert.deepEqual(placement(avatar(1100, 700), view), { side: "left", vertical: "above" });
});

test("a saved position stays inside the window, with a margin", () => {
  assert.deepEqual(clamp({ x: -50, y: 5000 }, { width: 72, height: 72 }, view), { x: 8, y: 720 });
  assert.deepEqual(clamp({ x: 300, y: 200 }, { width: 72, height: 72 }, view), { x: 300, y: 200 });
  assert.deepEqual(clamp({ x: 1190, y: -3 }, { width: 72, height: 72 }, view), { x: 1120, y: 8 });
});
