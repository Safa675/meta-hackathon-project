// LLM#1: does this one page serve the stated goal? Structured output, no tools.
// The model call is passed in (see memory/model.js); failures fall back to neutral,
// which never warns.
import { extractJsonObject } from "./json.js";
import { hostOf } from "../attention/relevance.js";
import { renderProfile } from "./profile.js";
import { DEFAULT_PROVIDER } from "../memory/model.js";

export const LABELS = ["related", "unrelated", "neutral"];

const LABEL_LINES = [
  "- related: serves the goal or one of its steps: docs, tools, research, files,",
  "  communication about it",
  "- unrelated: entertainment, social feeds, shopping, news or another topic",
];
const REPLY = [
  'Reply with one JSON object only: {"label": "related"|"unrelated"|"neutral",',
  '"confidence": number, "reason": one short sentence}.',
];

const SYSTEM = [
  "You are a focus companion. You judge whether ONE browser page serves the goal a",
  "person said they are working on, from the page's site and title only.",
  ...LABEL_LINES,
  "- neutral: you cannot tell from the site and title (generic titles, inboxes,",
  "  dashboards, home pages)",
  "Confidence (0..1) says how clear the title makes it. The person's own past labels,",
  "when given, show what counts as work for them; follow them. What is known about",
  "them says which subjects are theirs, and is weaker evidence than their own labels.",
  ...REPLY,
].join("\n");

// The second look: the same question with a short excerpt of the visible page near
// where the person is working. One site holds work and play (a chat about the goal
// on a social feed), so the excerpt decides, not the site.
const SYSTEM_EXCERPT = [
  "You are a focus companion. You judge whether ONE browser page serves the goal a",
  "person said they are working on, from the page's site, its title and a short",
  "excerpt of what is on screen near where they are working.",
  ...LABEL_LINES,
  "- neutral: the excerpt does not tell",
  "Judge what the excerpt is about, not the site: a conversation about the goal on a",
  "social site is related; a feed of other topics is unrelated. Confidence (0..1)",
  "says how clearly the excerpt shows it. What is known about them says which subjects",
  "are theirs, and is weaker evidence than the excerpt.",
  ...REPLY,
].join("\n");

// Page text goes to a model that does not train on it: Meta's Contributor tier may,
// so on Meta it becomes plain Muse Spark 1.3 (same key), whether Contributor was picked
// as the provider or typed as the model. Other providers are left as set.
export function privateSettings(settings = {}) {
  const provider = settings.provider ?? DEFAULT_PROVIDER;
  if (provider !== "meta" && provider !== "meta-contributor") return settings;
  const model = settings.model && !/contributor/i.test(settings.model) ? settings.model : undefined;
  return { ...settings, provider: "meta", model };
}

// The person's own notes the memory search found for this page, when it found any.
const NOTES_RULE = [
  "Their own notes, when given, say what they work on and with whom. A conversation with",
  "someone the notes tie to the goal is related, whatever the site or title says. A name",
  "or word that also appears in a note proves nothing by itself: the note must be about",
  "this person or this page, and about the goal. With no conversation named, a feed stays",
  "a feed, whatever the notes say.",
].join("\n");

export function relevanceMessages({
  intent,
  url,
  title,
  examples = [],
  profile = null,
  excerpt,
  notes = [],
  conversationWith,
}) {
  const steps = intent.steps?.length ? `Steps: ${intent.steps.join("; ")}` : null;
  const own = examples.length
    ? ["Their past labels:", ...examples.map((e) => `- ${e.host} "${e.title ?? ""}" → ${e.label}`)].join("\n")
    : null;
  const found = notes.length
    ? ["From their own notes:", ...notes.map((n) => `- [${n.topic}] ${n.title}: ${n.text}`)].join("\n")
    : null;
  const user = [
    `Goal: ${intent.title}`,
    steps,
    renderProfile(profile),
    own,
    found,
    "",
    `Page site: ${hostOf(url)}`,
    `Page title: ${title || "(no title)"}`,
    found && conversationWith ? `In a conversation with: ${conversationWith}` : null,
    excerpt ? `Page excerpt: ${excerpt}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const system = excerpt ? SYSTEM_EXCERPT : SYSTEM;
  return [
    { role: "system", content: found ? `${system}\n${NOTES_RULE}` : system },
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
