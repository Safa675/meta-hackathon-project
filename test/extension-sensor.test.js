import test from "node:test";
import assert from "node:assert/strict";
import { contextFlags, sameDocument } from "../extension/sensor.js";

const tab = { id: 7, windowId: 2, active: true, audible: false, url: "https://x.com", title: "X" };

test("review C2: only the active tab of the focused window is the page in front", () => {
  assert.equal(contextFlags({ ...tab, windowId: 3 }, { focusedWindowId: 2, idleState: "active" }), null);
  assert.equal(contextFlags({ ...tab, active: false }, { focusedWindowId: 2, idleState: "active" }), null);
  assert.deepEqual(contextFlags(tab, { focusedWindowId: 2, idleState: "active" }), {
    browserFocused: true,
    idleState: "active",
  });
});

test("review C2: a title change while the screen is locked stays away", () => {
  assert.deepEqual(contextFlags(tab, { focusedWindowId: 2, idleState: "locked" }), {
    browserFocused: true,
    idleState: "locked",
  });
});

test("review C2: with no Chrome window focused the browser is unfocused", () => {
  assert.deepEqual(contextFlags(tab, { focusedWindowId: -1, idleState: "active", forceUnfocused: true }), {
    browserFocused: false,
    idleState: "active",
  });
});

test("minor 5: a # change or trailing slash is the same page", () => {
  assert.equal(sameDocument("https://github.com/acme/shop#readme", "https://github.com/acme/shop"), true);
  assert.equal(sameDocument("https://github.com/acme/shop/", "https://github.com/acme/shop"), true);
  assert.equal(sameDocument("https://github.com/acme/shop?tab=x", "https://github.com/acme/shop"), false);
  assert.equal(sameDocument("https://youtube.com/watch?v=b", "https://youtube.com/watch?v=a"), false);
  assert.equal(sameDocument(undefined, "https://a.com"), false);
});
