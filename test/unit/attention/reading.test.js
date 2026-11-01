import test from "node:test";
import assert from "node:assert/strict";
import { mayRead, readingSettings, NEVER_READ } from "../../../src/attention/reading.js";

const on = readingSettings(undefined);

test("reading is on by default, with the never-read list", () => {
  assert.deepEqual(on, { enabled: true, neverRead: NEVER_READ });
  assert.ok(mayRead("https://www.linkedin.com/feed/", on));
});

test("turned off, nothing is read", () => {
  assert.ok(!mayRead("https://www.linkedin.com/feed/", readingSettings({ enabled: false })));
});

test("never read: money, government and health, passwords, email", () => {
  for (const url of [
    "https://www.isbank.com.tr/",
    "https://online.garantibbva.com.tr/",
    "https://www.turkiye.gov.tr/",
    "https://enabiz.gov.tr/",
    "https://vault.example.org/#/vault",
    "https://my.1password.com/",
    "https://mail.google.com/mail/u/0/#inbox",
    "https://www.paypal.com/myaccount",
  ])
    assert.ok(!mayRead(url, on), url);
});

test("a site the person adds is not read, with its subdomains", () => {
  const mine = readingSettings({ enabled: true, neverRead: ["linkedin.com", " *.slack.com "] });
  assert.ok(!mayRead("https://www.linkedin.com/feed/", mine));
  assert.ok(!mayRead("https://tr.linkedin.com/in/x", mine));
  assert.ok(!mayRead("https://acme.slack.com/", mine));
  assert.ok(mayRead("https://notlinkedin.com/", mine), "a suffix match needs the dot");
});

test("only web pages are read", () => {
  for (const url of ["chrome://settings", "file:///home/x.txt", "", "not a url"]) assert.ok(!mayRead(url, on), url);
});
