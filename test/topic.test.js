import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex, search, topicSearch, slugMatch, hostWords, tokenize, entryDoc } from "../memory/recall.js";
import { contextPack } from "../memory/context.js";

// Synthetic: a personal entry that shares words with the work project's name.
const e = (id, topic, title, next = "Do the next thing") => ({
  id, kind: "fact", topic, title, date: "2026-10-20", context: "Context.", result: "Result.", evidence: "none", next,
});
const entries = [
  e("p1", "personal", "Dinner with my Garden Club teammate after the garden club meetup"),
  e("w1", "garden-club", "Club website needs a new signup form"),
  e("w2", "garden-club", "Order seeds for the club stall"),
  e("w3", "garden-club", "Pick the meetup venue"),
  e("w4", "work", "Quarterly report draft"),
];
const index = buildIndex(entries.map(entryDoc));
const tab = "garden-club-site: Pull requests github";

test("plain keyword ranking lets the loosely related personal entry in first", () => {
  assert.equal(search(index, tab, { limit: 1 })[0].ref.id, "p1");
});

test("a topic the tab names outranks loose keyword hits; nothing is removed", () => {
  const hits = topicSearch(index, tab, { limit: 10 });
  assert.equal(hits[0].item.topic, "garden-club");
  assert.ok(hits.findIndex((h) => h.ref.id === "p1") > hits.findIndex((h) => h.item.topic === "garden-club"));
  assert.ok(hits.some((h) => h.ref.id === "p1")); // still reachable, only lower
});

test("the same personal entry ranks first when the activity is about it", () => {
  assert.equal(topicSearch(index, "personal dinner plans", { limit: 1 })[0].ref.id, "p1");
});

test("the stated intent's topic is boosted", () => {
  assert.equal(topicSearch(index, "report club", { limit: 1, topics: ["work"] })[0].ref.id, "w4");
});

test("slugMatch scores how much of a topic slug the query names", () => {
  const q = new Set(tokenize("meta-hackathon-project"));
  assert.equal(slugMatch("meta-hackathon", q), 1);
  assert.equal(slugMatch("bist-quant", new Set(tokenize("BIST 100"))), 0.5);
  assert.equal(slugMatch("dating", q), 0);
});

test("hostnames reduce to their name; URL debris is not a search word", () => {
  assert.equal(hostWords("https://www.youtube.com/watch?v=x"), "youtube");
  assert.equal(hostWords("https://mail.google.com/"), "mail google");
  assert.equal(hostWords("https://www.sahibinden.com.tr/"), "sahibinden");
  assert.equal(hostWords("not a url"), "");
  assert.deepEqual(tokenize("see https://www.example.com/page.html"), ["see", "example", "page"]);
});

test("context pack uses the topic ranking", () => {
  const pack = contextPack(index, entries, { title: "garden-club-site: Pull requests", url: "https://github.com/x/garden-club-site" });
  assert.equal(pack.openLoops[0].topic, "garden-club");
});
