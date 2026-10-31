// Context pack: what the agent needs to judge the current activity.
// The latest stated intent, the open loops related to what is on screen, and
// related notes, rendered as one bounded text block for a model prompt.
import { topicSearch, hostWords } from "./recall.js";

const isOpenLoop = (doc) => doc.ref.type === "entry" && doc.item.next && doc.item.next !== "none";

// The user's stated intent: the newest todo they set in the extension and have
// not marked done. Brain todos and distilled todos are open loops, not intents.
export function latestIntent(entries) {
  return entries
    .filter((e) => e.kind === "todo" && e.source === "extension" && !e.done)
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || b.date.localeCompare(a.date))[0];
}

// activity: { title, url } of what the user is looking at now.
export function contextPack(index, entries, activity, { loops = 5, notes = 5 } = {}) {
  const intent = latestIntent(entries);
  const query = [activity.title, hostWords(activity.url), intent?.title].filter(Boolean).join(" ");
  // Topics named by the tab, plus the stated intent's topic, rank first.
  const topics = intent ? [intent.topic] : [];
  return {
    activity,
    intent,
    openLoops: topicSearch(index, query, { limit: loops, filter: isOpenLoop, topics }).map((d) => d.item),
    related: topicSearch(index, query, { limit: notes, filter: (d) => !isOpenLoop(d), topics }).map((d) => ({
      type: d.ref.type,
      title: d.title,
      text: d.text,
    })),
  };
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function renderPack(pack, { maxChars = 6000 } = {}) {
  const lines = [
    `Now: ${pack.activity.title} (${pack.activity.url})`,
    pack.intent ? `Stated intent (${pack.intent.date}): ${pack.intent.title}; next: ${pack.intent.next}` : "Stated intent: none",
    "",
    "Open loops:",
    ...pack.openLoops.map((e) => `- [${e.date} ${e.topic}] ${e.title} → next: ${e.next}`),
    "",
    "Related:",
    ...pack.related.map((d) => `- ${d.title}: ${clip(d.text.replace(/\s+/g, " "), 300)}`),
  ];
  return clip(lines.join("\n"), maxChars);
}
