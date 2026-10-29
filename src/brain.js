// Reads a second-brain checkout into entries and free-form documents.
// Pure functions over [{ path, text }] so they run under node; the options page
// supplies the files from a folder the user picks. Nothing is filtered by topic.
import { makeEntry, fromInboxMarkdown } from "./entry.js";

const norm = (p) => p.replace(/\\/g, "/");

// notes/log/<yyyy>/*.md: frontmatter + "- **Label:** value" bullets.
export function fromLogMarkdown(text) {
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
  const bullet = (label) => {
    const r = new RegExp(`^- \\*\\*${label}:\\*\\* ([\\s\\S]*?)(?=\\n- \\*\\*|\\s*$)`, "m");
    return (m[2].match(r) ?? [])[1]?.trim();
  };
  return {
    ...makeEntry({
      kind: meta.kind,
      topic: meta.topic,
      title: meta.title,
      date: meta.date,
      source: meta.source,
      context: bullet("Context"),
      result: bullet("Decision/Result"),
      evidence: bullet("Evidence"),
      next: bullet("Next action"),
    }),
    id: meta.id,
  };
}

// files: [{ path, text }] with paths relative to the brain root.
export function loadBrain(files) {
  const entries = [];
  const documents = [];
  const skipped = [];
  const seen = new Set();

  for (const { path: raw, text } of files) {
    const path = norm(raw);
    if (!path.endsWith(".md")) continue;
    // inbox/_done duplicates notes/log; README is documentation, not an entry.
    if (path.startsWith("inbox/_done/") || path === "inbox/README.md") continue;

    const isInbox = path.startsWith("inbox/");
    const isLog = path.startsWith("notes/log/");
    if (isInbox || isLog) {
      try {
        const e = isLog ? fromLogMarkdown(text) : fromInboxMarkdown(text);
        const key = `${e.date}|${e.topic}|${e.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ ...e, path });
      } catch (err) {
        skipped.push({ path, reason: err.message });
      }
    } else if (path.startsWith("notes/")) {
      documents.push({ path, title: (text.match(/^# (.+)$/m) ?? [])[1] ?? path, text });
    }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return { entries, documents, skipped };
}

// Entries that name a next action. These are the open loops the audit checks
// against what the user actually does.
export function openLoops(entries) {
  return entries.filter((e) => e.next && e.next !== "none");
}
