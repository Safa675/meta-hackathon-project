// Context pack: what the agent needs to judge the current activity.
// The latest stated intent, the open loops related to what is on screen, and
// related notes, rendered as one bounded text block for a model prompt.
import { topicSearch, hostWords } from "./recall.js";
import { openLoops } from "./brain.js";
import { dueOf, daysLeft, dueLabel, localDate } from "./due.js";

const isOpenLoop = (doc) => doc.ref.type === "entry" && doc.item.next && doc.item.next !== "none";

const keyOf = (e) => e.id ?? `${e.date}|${e.title}`;

// Open loops ordered by how little time is left, soonest first, then the undated ones
// newest first. Plain arithmetic on purpose: what is urgent is never a model
// judgement (docs/INTENT.md, "Facts and timing are deterministic").
//
// A deadline long past is not a live task: nothing in the brain marks a loop done,
// so without `staleAfter` a note from last year would hold the top of the queue
// forever. Those sink below the undated ones instead of being dropped, because a
// missed deadline is still worth seeing.
export function taskQueue(entries, { today = localDate(), limit = 5, staleAfter = 14 } = {}) {
  const loops = openLoops(entries).map((e) => {
    const due = dueOf(e);
    return { ...e, due, daysLeft: daysLeft(due, today) };
  });
  const byDue = (a, b) => a.due.localeCompare(b.due);
  const live = loops.filter((e) => e.due && e.daysLeft >= -staleAfter).sort(byDue);
  const undated = loops.filter((e) => !e.due).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const stale = loops.filter((e) => e.due && e.daysLeft < -staleAfter).sort((a, b) => byDue(b, a));
  return [...live, ...undated, ...stale].slice(0, limit);
}

// The user's stated intent: the newest todo they set in the extension and have
// not marked done. Brain todos and distilled todos are open loops, not intents.
export function latestIntent(entries) {
  return entries
    .filter((e) => e.kind === "todo" && e.source === "extension" && !e.done)
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || b.date.localeCompare(a.date))[0];
}

// activity: { title, url } of what the user is looking at now.
export function contextPack(index, entries, activity, { loops = 5, notes = 5, today } = {}) {
  const intent = latestIntent(entries);
  const query = [activity.title, hostWords(activity.url), intent?.title].filter(Boolean).join(" ");
  // Topics named by the tab, plus the stated intent's topic, rank first.
  const topics = intent ? [intent.topic] : [];
  return {
    activity,
    intent,
    // Two orderings, and both matter: what is running out, and what resembles the
    // page in front of you.
    queue: taskQueue(entries, { today, limit: loops }),
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
  // What has a date comes first and says how long is left; the rest keeps the
  // relevance order, minus anything already named above it. The heading says
  // "Deadlines", not "due soon": every line carries its own distance, and calling a
  // date four months out "soon" would read as urgent in the prompt.
  const due = (pack.queue ?? []).filter((e) => e.due);
  const shown = new Set(due.map(keyOf));
  const lines = [
    `Now: ${pack.activity.title} (${pack.activity.url})`,
    pack.intent
      ? `Stated intent (${pack.intent.date}): ${pack.intent.title}; next: ${pack.intent.next}`
      : "Stated intent: none",
    ...(due.length
      ? [
          "",
          "Deadlines:",
          ...due.map((e) => `- [${e.topic}] ${e.title} → due ${e.due} (${dueLabel(e.daysLeft)}); next: ${e.next}`),
        ]
      : []),
    "",
    "Open loops:",
    ...pack.openLoops
      .filter((e) => !shown.has(keyOf(e)))
      .map((e) => `- [${e.date} ${e.topic}] ${e.title} → next: ${e.next}`),
    "",
    "Related:",
    ...pack.related.map((d) => `- ${d.title}: ${clip(d.text.replace(/\s+/g, " "), 300)}`),
  ];
  return clip(lines.join("\n"), maxChars);
}
