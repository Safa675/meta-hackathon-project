import test from "node:test";
import assert from "node:assert/strict";
import { profileMessages, parseProfile, renderProfile, buildProfile } from "../../../src/agent/profile.js";

const entries = [
  { topic: "bilun", title: "SUT rules engine audits MEDULA invoices", next: "Ship rule 48" },
  { topic: "meta-hackathon", title: "Tuck companion built as a Chrome extension", next: "none" },
];
const reply = (o) => JSON.stringify(o);

// A fake model: returns the given replies in order and records what it was sent.
function fakeModel(...replies) {
  const calls = [];
  const complete = async (messages, opts) => {
    calls.push({ messages, opts });
    const r = replies[calls.length - 1];
    if (r instanceof Error) throw r;
    return r;
  };
  return { complete, calls };
}

test("the notes go in with their topics and next actions", () => {
  const [, user] = profileMessages(entries);
  assert.match(user.content, /\[bilun\] SUT rules engine audits MEDULA invoices → next: Ship rule 48/);
  assert.doesNotMatch(user.content, /next: none/, "a filed entry carries no next action");
});

test("a valid reply is parsed, and hosts are normalised", () => {
  const p = parseProfile(
    reply({ summary: "Builds Bilun, a SUT rules engine.", topics: ["bilun"], workHosts: ["WWW.GitHub.com"] }),
  );
  assert.equal(p.summary, "Builds Bilun, a SUT rules engine.");
  assert.deepEqual(p.topics, ["bilun"]);
  assert.deepEqual(p.workHosts, ["github.com"]);
});

test("a reply with no summary is invalid", () => {
  assert.throws(() => parseProfile(reply({ topics: ["bilun"] })), /summary/);
});

test("a model failure leaves no profile, and never throws at the caller", async () => {
  const { complete } = fakeModel(new Error("503"), new Error("503"));
  const r = await buildProfile(complete, entries);
  assert.equal(r.profile, null);
  assert.equal(r.source, "fallback");
});

test("an invalid reply is asked again once", async () => {
  const { complete, calls } = fakeModel(reply({ topics: [] }), reply({ summary: "Builds Bilun.", topics: ["bilun"] }));
  const r = await buildProfile(complete, entries);
  assert.equal(r.profile.summary, "Builds Bilun.");
  assert.equal(calls.length, 2);
});

test("empty memory asks the model nothing", async () => {
  const { complete, calls } = fakeModel(reply({ summary: "x" }));
  const r = await buildProfile(complete, []);
  assert.equal(r.profile, null);
  assert.equal(r.source, "empty");
  assert.equal(calls.length, 0);
});

test("renders one line for the other prompts, or nothing at all", () => {
  assert.equal(
    renderProfile({ summary: "Builds Bilun.", topics: ["bilun", "meta-hackathon"] }),
    "About them: Builds Bilun. Their topics: bilun, meta-hackathon.",
  );
  assert.equal(renderProfile(null), null);
});

test("the work sites reach the prompt line, so they are not stored for nothing", () => {
  const line = renderProfile({ summary: "Builds Bilun.", topics: ["bilun"], workHosts: ["github.com"] });
  assert.match(line, /Sites they work on: github\.com\./);
});
