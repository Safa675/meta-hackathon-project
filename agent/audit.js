// The audit: does what the user is doing serve what they said they would do?
// Builds the prompt from memory (context pack + recent activity), asks the model,
// and parses a verdict. The model call is passed in (see memory/model.js).

export const VERDICTS = ["on_track", "drifting", "break", "unclear"];

export function auditMessages({ activityText, contextPrompt, now = new Date() }) {
  const system = [
    "You are a focus companion. You compare what a person said they would do with what",
    "they are actually doing in the browser, and decide one of:",
    "- on_track: the activity serves the stated intent or one of the open loops",
    "- drifting: the activity is unrelated and has gone on long enough to matter",
    "- break: unrelated, but short (under about 10 minutes) after a stretch of focused work",
    "- unclear: not enough activity or no stated intent to judge",
    "Research, docs, issue trackers and tools used for the task count as on_track.",
    "",
    'Reply with one JSON object only: {"verdict": ..., "confidence": 0..1,',
    ' "reason": one sentence citing sites and minutes, "nudge": one short sentence to the',
    ' person, friendly and concrete, naming the next step; empty string when on_track}.',
    "No medical or mental-health advice, no diagnosis, no moralizing.",
  ].join("\n");
  const user = [`Now: ${now.toISOString()}`, "", activityText, "", contextPrompt].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// Reasoning models may wrap the answer in <think> blocks or code fences.
export function extractJsonObject(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in model reply");
  return JSON.parse(clean.slice(start, end + 1));
}

export function parseVerdict(text) {
  const raw = extractJsonObject(text);
  const verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : "unclear";
  const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
  const reason = String(raw.reason ?? "").slice(0, 300);
  const nudge = verdict === "on_track" ? "" : String(raw.nudge ?? "").slice(0, 200);
  return { verdict, confidence, reason, nudge };
}

// memory: a Memory instance; complete: (messages, opts) -> text.
export async function runAudit(memory, complete, { minutes = 30, now = Date.now() } = {}) {
  const act = await memory.activity({ minutes, now });
  const current = act.spans.at(-1);
  const intent = await memory.latestIntent();
  // Nothing to judge: skip the model call.
  if (!current || !intent) {
    return {
      verdict: "unclear",
      confidence: 1,
      reason: !current ? "No browser activity in the window." : "No stated intent yet.",
      nudge: !intent ? "What are you working on right now?" : "",
      activity: act.text,
      intent,
    };
  }
  const { prompt } = await memory.contextPack({ title: current.title, url: current.url });
  const messages = auditMessages({ activityText: act.text, contextPrompt: prompt, now: new Date(now) });
  const verdict = parseVerdict(await complete(messages, { maxTokens: 400 }));
  return { ...verdict, activity: act.text, intent };
}
