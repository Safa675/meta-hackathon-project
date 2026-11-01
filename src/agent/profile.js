// LLM#5: who is this person, read once from their imported memory. Structured
// output, no tools. It runs at import and at re-sync — never on the nudge path, so
// it costs one call per import and nothing per page.
//
// Without it a new user starts from zero: relevance.js only ever learns what counts
// as work for them from labels they have clicked.
import { extractJsonObject } from "./json.js";

const MAX_TOPICS = 12;
const MAX_HOSTS = 12;
const SAMPLE = 60;

const SYSTEM = [
  "You read a sample of someone's own notes and say who they are, so a focus",
  "companion knows what counts as work for them.",
  "- summary: one or two plain sentences. What they work on, what they are studying",
  "  or building. No praise, no advice, no guesses about their character.",
  "- topics: the topic slugs from the notes that are their real work, most important",
  "  first. Copy the slugs exactly as they appear.",
  "- workHosts: bare hostnames that are clearly work for this person, from what the",
  "  notes mention (github.com, a tool they build on). Leave empty when unsure; a",
  "  wrong host here makes the companion miss real distractions.",
  "Write nothing you cannot point to in the notes.",
  'Reply with one JSON object only: {"summary": "...", "topics": ["..."],',
  '"workHosts": ["..."]}.',
].join("\n");

export function profileMessages(entries, { sample = SAMPLE } = {}) {
  const lines = entries
    .slice(0, sample)
    .map((e) => `- [${e.topic}] ${e.title}${e.next && e.next !== "none" ? ` → next: ${e.next}` : ""}`);
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: ["Their notes:", ...lines].join("\n") },
  ];
}

const strings = (v, max) =>
  (Array.isArray(v) ? v : [])
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim())
    .slice(0, max);

export function parseProfile(text) {
  const raw = extractJsonObject(text);
  if (typeof raw.summary !== "string" || !raw.summary.trim()) throw new Error("summary must be a non-empty string");
  return {
    summary: raw.summary.trim().slice(0, 300),
    topics: strings(raw.topics, MAX_TOPICS),
    workHosts: strings(raw.workHosts, MAX_HOSTS).map((h) => h.toLowerCase().replace(/^www\./, "")),
  };
}

// One line for the other prompts. Null profile renders as null, and the caller omits it.
export function renderProfile(profile) {
  if (!profile?.summary) return null;
  const topics = profile.topics?.length ? ` Their topics: ${profile.topics.join(", ")}.` : "";
  const hosts = profile.workHosts?.length ? ` Sites they work on: ${profile.workHosts.join(", ")}.` : "";
  return `About them: ${profile.summary}${topics}${hosts}`;
}

// Returns {profile, source, latencyMs, error?}; profile is null when the call failed,
// and the caller then behaves exactly as it did before a profile existed.
export async function buildProfile(complete, entries, { now = Date.now, sample } = {}) {
  const started = now();
  if (!entries?.length) return { profile: null, source: "empty", latencyMs: 0 };
  const messages = profileMessages(entries, { sample });
  const opts = { maxTokens: 4000, temperature: 0 };
  try {
    const first = await complete(messages, opts);
    try {
      return { profile: parseProfile(first), source: "llm", latencyMs: now() - started };
    } catch (err) {
      const retry = [
        ...messages,
        { role: "assistant", content: first },
        { role: "user", content: `Your last reply was invalid: ${err.message}. Reply with the JSON object only.` },
      ];
      return { profile: parseProfile(await complete(retry, opts)), source: "llm", latencyMs: now() - started };
    }
  } catch (err) {
    return { profile: null, source: "fallback", latencyMs: now() - started, error: err.message ?? String(err) };
  }
}
