// Distill: a model turns recent activity into memory entries in the brain's
// format. This file builds the prompt and parses the reply; the model call is
// passed in, so it is testable without a network.
import { KINDS, validate } from "./entry.js";

export const MAX_ENTRIES = 3;

export function distillMessages({ activityText, contextPrompt, topics = [], date }) {
  const system = [
    "You keep a person's work memory. From their recent browser activity, write at most",
    `${MAX_ENTRIES} memory entries worth keeping: a decision they made, a fact they verified,`,
    "a task they started or dropped, or a lesson. Skip routine browsing. If nothing is worth",
    "keeping, return [].",
    "",
    "Reply with a JSON array only. Each item:",
    `{"kind": one of ${KINDS.join("|")}, "topic": slug (a-z, 0-9, -), "title": 3-120 chars,`,
    ' "context": what was going on, "result": the decision/fact/outcome, "evidence": sites and',
    ' times it rests on, "next": the next action or "none"}',
    "",
    "Rules: state only what the activity shows; no guesses about motives; never copy",
    "passwords, keys or tokens. Prefer an existing topic when one fits.",
  ].join("\n");
  const user = [
    `Today: ${date}`,
    topics.length ? `Existing topics: ${topics.join(", ")}` : "",
    "",
    activityText,
    "",
    "What memory already holds about this:",
    contextPrompt,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// Reasoning models may wrap the answer in <think> blocks or code fences.
export function extractJsonArray(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("no JSON array in model reply");
  return JSON.parse(clean.slice(start, end + 1));
}

export function parseEntries(text, { date, source = "distill" }) {
  const items = extractJsonArray(text);
  if (!Array.isArray(items)) throw new Error("model reply is not an array");
  const entries = [];
  const rejected = [];
  for (const raw of items.slice(0, MAX_ENTRIES)) {
    const e = {
      kind: raw?.kind,
      topic: String(raw?.topic ?? "").toLowerCase(),
      title: raw?.title,
      date,
      source,
      context: raw?.context,
      result: raw?.result,
      evidence: raw?.evidence || "none",
      next: raw?.next || "none",
    };
    const errors = validate(e);
    if (errors.length) rejected.push({ item: raw, errors });
    else entries.push(e);
  }
  return { entries, rejected };
}
