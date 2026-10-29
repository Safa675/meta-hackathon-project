// Memory entry: same fields as the second-brain inbox record
// (Date · Context · Decision/Result · Evidence · Next action), so entries can be
// exported as inbox files and a brain can be read back in as entries later.
// Pure functions, no chrome.* APIs, so they run under node.

export const KINDS = ["decision", "fact", "preference", "event", "lesson", "todo"];
const SLUG = /^[a-z0-9-]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function makeEntry({ kind, topic, title, context, result, evidence, next, date, source = "meta-hackathon-project" }) {
  const entry = {
    kind,
    topic,
    title,
    date: date ?? new Date().toISOString().slice(0, 10),
    source,
    context,
    result,
    evidence: evidence || "none",
    next: next || "none",
  };
  const errors = validate(entry);
  if (errors.length) throw new Error(`invalid entry: ${errors.join("; ")}`);
  return entry;
}

export function validate(e) {
  const errors = [];
  if (!KINDS.includes(e.kind)) errors.push(`kind must be one of ${KINDS.join("|")}`);
  if (!SLUG.test(e.topic ?? "")) errors.push("topic must be a slug (a-z, 0-9, -)");
  if (!e.title || e.title.length < 3 || e.title.length > 120) errors.push("title must be 3-120 chars");
  if (!DATE.test(e.date ?? "")) errors.push("date must be YYYY-MM-DD");
  if (!e.context) errors.push("context required");
  if (!e.result) errors.push("result required");
  return errors;
}

const q = (s) => JSON.stringify(s);

// Same shape as files in the brain's inbox/: YAML frontmatter + labelled body.
export function toInboxMarkdown(e, host = "browser") {
  return [
    "---",
    `kind: ${e.kind}`,
    `topic: ${e.topic}`,
    `title: ${q(e.title)}`,
    `date: ${e.date}`,
    `source: ${e.source}`,
    `host: ${host}`,
    "---",
    `Context: ${e.context}`,
    `Decision/Result: ${e.result}`,
    `Evidence: ${e.evidence}`,
    `Next action: ${e.next}`,
    "",
  ].join("\n");
}

// Inverse of toInboxMarkdown, for reading a brain's inbox/log files back in.
export function fromInboxMarkdown(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("no frontmatter");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v);
    meta[line.slice(0, i).trim()] = v;
  }
  const field = (label, nextLabel) => {
    const r = new RegExp(`${label}: ([\\s\\S]*?)(?:\\n${nextLabel}: |\\s*$)`);
    return (m[2].match(r) ?? [])[1]?.trim();
  };
  return makeEntry({
    kind: meta.kind,
    topic: meta.topic,
    title: meta.title,
    date: meta.date,
    source: meta.source,
    context: field("Context", "Decision/Result"),
    result: field("Decision/Result", "Evidence"),
    evidence: field("Evidence", "Next action"),
    next: field("Next action", "$^"),
  });
}
