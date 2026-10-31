// Pull the JSON object out of a model reply. Copied from agent/audit.js.

// Reasoning models may wrap the answer in <think> blocks or code fences.
export function extractJsonObject(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in model reply");
  return JSON.parse(clean.slice(start, end + 1));
}
