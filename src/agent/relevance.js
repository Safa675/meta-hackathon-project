// LLM#1: does this one page serve the stated goal? Structured output, no tools.
// The model call is passed in (see memory/model.js); failures fall back to neutral,
// which never warns.
import { extractJsonObject } from "./json.js";
import { hostOf } from "../attention/relevance.js";
import { renderProfile } from "./profile.js";

export const LABELS = ["related", "unrelated", "neutral"];

const SYSTEM = [
  "You are a focus companion. You judge whether ONE browser page serves the goal a",
  "person said they are working on, from the page's site and title only.",
  "- related: serves the goal or one of its steps: docs, tools, research, files,",
  "  communication about it",
  "- unrelated: entertainment, social feeds, shopping, news or another topic",
  "- neutral: you cannot tell from the site and title (generic titles, inboxes,",
  "  dashboards, home pages)",
  "Confidence (0..1) says how clear the title makes it. The person's own past labels,",
  "when given, show what counts as work for them; follow them. What is known about",
  "them says which subjects are theirs, and is weaker evidence than their own labels.",
  'Reply with one JSON object only: {"label": "related"|"unrelated"|"neutral",',
  '"confidence": number, "reason": one short sentence}.',
].join("\n");

export function relevanceMessages({ intent, url, title, examples = [], profile = null }) {
  const steps = intent.steps?.length ? `Steps: ${intent.steps.join("; ")}` : null;
  const own = examples.length
    ? ["Their past labels:", ...examples.map((e) => `- ${e.host} "${e.title ?? ""}" → ${e.label}`)].join("\n")
    : null;
  const user = [
    `Goal: ${intent.title}`,
    steps,
    renderProfile(profile),
    own,
    "",
    `Page site: ${hostOf(url)}`,
    `Page title: ${title || "(no title)"}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}

export function parseRelevance(text) {
  const raw = extractJsonObject(text);
  if (!LABELS.includes(raw.label))
    throw new Error(`label must be one of ${LABELS.join("|")}, got ${JSON.stringify(raw.label)}`);
  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    throw new Error(`confidence must be a number 0..1, got ${JSON.stringify(raw.confidence)}`);
  return { label: raw.label, confidence, reason: String(raw.reason ?? "").slice(0, 200) };
}

export async function classifyRelevance(complete, input, { now = Date.now } = {}) {
  const started = now();
  const messages = relevanceMessages(input);
  const opts = { maxTokens: 4000, temperature: 0 };
  let retried = false;
  try {
    const first = await complete(messages, opts);
    try {
      return { ...parseRelevance(first), source: "llm", latencyMs: now() - started, retried };
    } catch (err) {
      retried = true;
      const retry = [
        ...messages,
        { role: "assistant", content: first },
        { role: "user", content: `Your last reply was invalid: ${err.message}. Reply with the JSON object only.` },
      ];
      return { ...parseRelevance(await complete(retry, opts)), source: "llm", latencyMs: now() - started, retried };
    }
  } catch (err) {
    return {
      label: "neutral",
      confidence: 0,
      reason: "",
      source: "fallback",
      latencyMs: now() - started,
      retried,
      error: err.message ?? String(err),
    };
  }
}
