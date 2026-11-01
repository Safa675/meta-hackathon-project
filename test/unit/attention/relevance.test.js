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
  nextLabel,
  labelHolds,
  notesAbout,
  notWorkKey,
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

// ---- "This is for my task" (issue #5) ----------------------------------------

const MIN = 60 * 1000;
const at = Date.UTC(2026, 10, 1, 9, 0);
const site = (prev, ts, day) =>
  nextLabel(
    prev,
    { key: "pitch|linkedin.com", topic: "pitch", host: "linkedin.com", title: "Feed | LinkedIn", ts, day },
    DEFAULTS,
  );

test("a whole-site label is for this visit: it lasts labelMin minutes", () => {
  const l = site(null, at, "2026-11-01");
  assert.equal(l.until, at + DEFAULTS.labelMin * MIN);
  assert.ok(labelHolds(l, at + 29 * MIN));
  assert.ok(!labelHolds(l, at + 30 * MIN));
});

test("a whole-site label lasts for good once given on labelDays different days", () => {
  let l = site(null, at, "2026-11-01");
  l = site(l, at + 60 * MIN, "2026-11-01"); // same day again: still one day
  assert.deepEqual(l.days, ["2026-11-01"]);
  assert.notEqual(l.until, null);
  l = site(l, at + 24 * 60 * MIN, "2026-11-02");
  assert.notEqual(l.until, null);
  l = site(l, at + 48 * 60 * MIN, "2026-11-03");
  assert.equal(l.until, null);
  assert.ok(labelHolds(l, at + 365 * 24 * 60 * MIN));
});

test("a title label (YouTube and the like) lasts from the first click", () => {
  const l = nextLabel(
    null,
    {
      key: "pitch|youtube.com|demo tips",
      topic: "pitch",
      host: "youtube.com",
      title: "Demo tips",
      ts: at,
      day: "2026-11-01",
    },
    DEFAULTS,
  );
  assert.equal(l.until, null);
  assert.ok(labelHolds(l, at + 365 * 24 * 60 * MIN));
});

test("labels saved before they expired: a site label no longer holds, a title label does", () => {
  const old = { key: "pitch|linkedin.com", label: "related", topic: "pitch", host: "linkedin.com", ts: at };
  assert.ok(!labelHolds(old, at));
  assert.ok(labelHolds({ ...old, key: "pitch|youtube.com|x", host: "youtube.com" }, at));
  assert.ok(!labelHolds(undefined, at));
});

// One URL and title can hold a chat and a feed (issue #9): their judgments stay apart.
const CHAT = { kind: "conversation", labels: ["Ali"] };
const PLAIN = { kind: "page", labels: [] };

test("a conversation has its own relevance key per person; a page keeps the key it always had", () => {
  const url = "https://www.linkedin.com/feed/";
  const base = "i1|linkedin.com|feed | linkedin";
  assert.equal(relevanceKey("i1", url, "Feed | LinkedIn"), base);
  assert.equal(relevanceKey("i1", url, "Feed | LinkedIn", PLAIN), base);
  assert.equal(relevanceKey("i1", url, "Feed | LinkedIn", CHAT), `${base}|conversation|ali`);
  assert.equal(
    relevanceKey("i1", url, "Feed | LinkedIn", { kind: "conversation", labels: [] }),
    `${base}|conversation`,
  );
});

test("what is known of one person says nothing of another", () => {
  const url = "https://www.linkedin.com/feed/";
  const other = { kind: "conversation", labels: ["Deniz"] };
  assert.notEqual(relevanceKey("i1", url, "x", CHAT), relevanceKey("i1", url, "x", other));
  assert.notEqual(labelKeys("shop", url, "x", CHAT)[0], labelKeys("shop", url, "x", other)[0]);
});

test("a conversation looks at its own label first, then the page's; a page never at the conversation's", () => {
  const url = "https://www.linkedin.com/feed/";
  assert.deepEqual(labelKeys("shop", url, "x", CHAT), ["shop|linkedin.com|conversation|ali", "shop|linkedin.com"]);
  assert.deepEqual(labelKeys("shop", url, "x", PLAIN), ["shop|linkedin.com"]);
  assert.deepEqual(labelKeys("shop", "https://x.com/home", "Home", CHAT), [
    "shop|x.com|conversation|ali",
    "shop|x.com|home",
    "shop|x.com",
  ]);
});

test("a conversation label on a title-sensitive host expires like a site label", () => {
  const cfg = withOverrides({ labelMin: 30, labelDays: 3 });
  const page = { key: "shop|x.com|conversation", topic: "shop", host: "x.com", title: "Home", ts: 0, day: "d1" };
  const label = nextLabel(null, { ...page, surface: "conversation" }, cfg);
  assert.equal(label.surface, "conversation");
  assert.equal(label.until, 30 * 60 * 1000);
  assert.equal(labelHolds(label, 29 * 60 * 1000), true);
  assert.equal(labelHolds(label, 31 * 60 * 1000), false, "x.com's title rule is about pages");
  const titleLabel = nextLabel(null, { ...page, key: "shop|x.com|home" }, cfg);
  assert.equal(titleLabel.until, null, "a title label on the same host still lasts");
});

// Memory's search matches on any one word (issue #8).
const entry = (title, context, topic = "shop") => ({
  title,
  item: { topic, context, result: "Done.", next: "none" },
});

test("a word in common with a note is not enough", () => {
  const hits = [
    entry("Grocery plan of the week", "Buy the rice."),
    entry("Tax", "File the form by the end of the year."),
  ];
  const page = { title: "Top 10 F1 crashes of the year", host: "youtube.com" };
  assert.deepEqual(notesAbout(hits, page), []);
});

test("on a page, a note names the site or shares two words with the title", () => {
  const site = entry("LinkedIn nudge", "Tuck spoke during a chat.");
  const titled = entry("Acme Cart review", "Compare their checkout flow.");
  const one = entry("Cart cleanup", "Remove old items.");
  const found = notesAbout([site, titled, one], { title: "Acme Cart: a shop tool", host: "linkedin.com" });
  assert.deepEqual(
    found.map((n) => n.title),
    ["LinkedIn nudge", "Acme Cart review"],
  );
});

test("in a conversation, a note must name the person, across spellings", () => {
  const known = entry("Demo plan", "Working with İrem on the hackathon.");
  const site = entry("LinkedIn nudge", "Tuck spoke during a chat.");
  const found = notesAbout([site, known], { title: "Feed", host: "linkedin.com", name: "IREM OZTIMUR" });
  assert.deepEqual(
    found.map((n) => n.title),
    ["Demo plan"],
  );
  assert.deepEqual(notesAbout([site], { title: "Feed", host: "linkedin.com", name: "Create post" }), []);
});

test("entries go whole; a long plain note is cut around the word that matched", () => {
  const long = "x ".repeat(4000) + "Working with Deniz Kaya here. " + "y ".repeat(4000);
  const plain = { title: "Project log", item: { text: long } };
  const [note, ent] = notesAbout([plain, entry("Kaya entry", `Deniz ${"c".repeat(1800)}`)], {
    title: "x",
    host: "a.com",
    name: "Deniz Kaya",
  });
  assert.match(note.text, /Working with Deniz Kaya/);
  assert.ok(note.text.length <= 1500);
  assert.ok(ent.text.length > 1800);
});

test("at most five notes", () => {
  const hits = Array.from({ length: 8 }, (_, i) => entry(`Note ${i}`, "About Deniz."));
  assert.equal(notesAbout(hits, { title: "x", host: "a.com", name: "Deniz" }).length, 5);
});

test("the cut still holds the match when folding shifts a Turkish note's positions", () => {
  const before = "İİı şğüöç ".repeat(5000);
  const text = `${before}Deniz Kaya ile çalışıyoruz. ${"son ".repeat(5000)}`;
  const [note] = notesAbout([{ title: "Proje günlüğü", item: { text } }], {
    title: "x",
    host: "a.com",
    name: "Deniz Kaya",
  });
  assert.match(note.text, /Deniz Kaya ile çalışıyoruz/);
  assert.ok(note.text.length <= 1500);
});

test("a no to Tuck's question lasts at once; a later yes replaces it and starts its own count", () => {
  const cfg = withOverrides({ labelMin: 30, labelDays: 3 });
  const page = { key: "shop|a.com", topic: "shop", host: "a.com", title: "x" };
  const no = nextLabel(null, { ...page, ts: 0, day: "d1", label: "unrelated" }, cfg);
  assert.equal(no.label, "unrelated");
  assert.equal(labelHolds(no, 10 ** 12), true);
  const yes = nextLabel(no, { ...page, ts: 1, day: "d1" }, cfg);
  assert.equal(yes.label, "related");
  assert.deepEqual(yes.days, ["d1"]);
  assert.ok(yes.until != null, "one yes after a no is for this visit");
});

test("a no is about that page or that chat, never the whole site", () => {
  const url = "https://github.com/acme/other";
  assert.equal(notWorkKey("shop", url, "Other repo"), "shop|github.com|other repo");
  assert.notEqual(notWorkKey("shop", url, "Other repo"), notWorkKey("shop", url, "cart.js · acme/shop"));
  assert.ok(!labelKeys("shop", url, "cart.js").includes(notWorkKey("shop", url, "Other repo")));
  assert.equal(notWorkKey("shop", url, "x", CHAT), "shop|github.com|conversation|ali");
});
