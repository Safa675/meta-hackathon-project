// Keys and fixed rules for relevance. Pure; the model call lives in agent/relevance.js.

export const TITLE_SENSITIVE = [
  "youtube.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "medium.com",
  "news.ycombinator.com",
  "instagram.com",
  "tiktok.com",
];

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizeTitle(title = "") {
  return title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

// surface: where on the page the person works (background/page.js readRegion), or nothing.
const inConversation = (surface) => surface?.kind === "conversation";

// "conversation|ali demir": what is known of one person says nothing of another.
function conversationPart(surface) {
  const name = normalizeTitle(surface.labels?.[0] ?? "");
  return name ? `conversation|${name}` : "conversation";
}

// Cache key: one judgment per goal and page. One URL and title can hold a chat and a
// feed, so a conversation has its own, per person.
export function relevanceKey(intentId, url, title, surface) {
  const page = `${intentId}|${hostOf(url)}|${normalizeTitle(title)}`;
  return inConversation(surface) ? `${page}|${conversationPart(surface)}` : page;
}

// User labels, most specific first. On sites where one host holds work and
// play (YouTube), a label sticks to the title; elsewhere to the host. A conversation
// has its own label first; what is said of the page covers it, never the other way.
export function labelKeys(topic, url, title, surface) {
  const host = hostOf(url);
  const page = TITLE_SENSITIVE.includes(host)
    ? [`${topic}|${host}|${normalizeTitle(title)}`, `${topic}|${host}`]
    : [`${topic}|${host}`];
  return inConversation(surface) ? [`${topic}|${host}|${conversationPart(surface)}`, ...page] : page;
}

// "This is for my task". A title label (TITLE_SENSITIVE hosts) lasts. A whole-site or
// conversation label says "this visit is work", not "this is always work": it lasts
// cfg.labelMin minutes, and for good only once given on cfg.labelDays different days.
// day: the local day of ts (intents.js dayKey). surface: "conversation", or nothing.
export function nextLabel(prev, { key, topic, host, title, ts, day, surface }, cfg) {
  const days = [...new Set([...(prev?.days ?? []), day])];
  const titled = TITLE_SENSITIVE.includes(host) && surface !== "conversation";
  const lasting = titled || days.length >= cfg.labelDays;
  return {
    key,
    label: "related",
    topic,
    host,
    title,
    ts,
    days,
    until: lasting ? null : ts + cfg.labelMin * 60 * 1000,
    ...(surface && { surface }),
  };
}

export function labelHolds(label, now) {
  if (!label) return false;
  if (TITLE_SENSITIVE.includes(label.host) && label.surface !== "conversation") return true;
  // A site label saved before labels expired came from one click: it no longer holds.
  if (!label.days) return false;
  return label.until == null || now < label.until;
}

// ---- Notes about a page or a person ----------------------------------------
// Memory's search matches on any one shared word, even "the". Sent as it is, nearly every
// page would carry unrelated notes to the model. This keeps what is really about it.
const COMMON = new Set(
  (
    "the and for with from this that you your are was were has have not but all can how what when why who " +
    "new home page feed about into our out one two get bir ile için icin gibi daha çok cok ama veya"
  ).split(" "),
);
const foldText = (s) => s.replace(/[İIı]/g, "i").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const wordsOf = (s = "") =>
  foldText(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !COMMON.has(w));

// A plain note can run to hundreds of thousands of characters: the part around the word
// that matched, so the model sees why it was found. Folding the whole text once can shift
// positions by a few characters (İ, decomposed letters); a centred window absorbs that.
function around(text, words, chars) {
  if (text.length <= chars) return text;
  const folded = foldText(text);
  const at = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0), Infinity);
  const start = at === Infinity ? 0 : Math.max(0, at - Math.floor(chars / 2));
  return text.slice(start, start + chars);
}

// hits: memory.recall() results. In a conversation a note must name the person. On a page
// it must name the site, or share two words with the title. Entries go whole, short by
// nature; plain notes are cut to `chars`. Returns [{topic, title, text}], at most `max`.
export function notesAbout(hits, { title, host, name }, { max = 5, chars = 1500 } = {}) {
  const nameWords = wordsOf(name);
  const siteWords = wordsOf((host ?? "").split(".").slice(0, -1).join(" "));
  const titleWords = wordsOf(title);
  const found = [];
  for (const { title: noteTitle, item } of hits) {
    const plain = typeof item.text === "string";
    const body = plain
      ? item.text
      : [item.context, item.result, item.next !== "none" && item.next].filter(Boolean).join(" ");
    const words = new Set(wordsOf(`${noteTitle} ${body}`));
    const has = (w) => words.has(w);
    const about = nameWords.length ? nameWords.some(has) : siteWords.some(has) || titleWords.filter(has).length >= 2;
    if (!about) continue;
    const text = plain ? around(body, nameWords.length ? nameWords : [...siteWords, ...titleWords], chars) : body;
    found.push({ topic: item.topic ?? "notes", title: noteTitle, text: text.replace(/\s+/g, " ") });
    if (found.length === max) break;
  }
  return found;
}

const NEUTRAL_SCHEMES = ["about:", "chrome:", "edge:", "chrome-extension:"];
const NEUTRAL_PAGES = [
  (u) => u.hostname === "www.google.com" && u.pathname === "/search",
  (u) => u.hostname === "www.bing.com" && u.pathname === "/search",
  (u) => u.hostname === "duckduckgo.com",
  (u) => u.hostname === "calendar.google.com",
];

// In-between stops (new tab, search, calendar, this extension) are neither work nor drift.
export function builtinLabel(url, ownOrigin = "") {
  if (!url || (ownOrigin && url.startsWith(ownOrigin))) return "neutral";
  if (NEUTRAL_SCHEMES.some((s) => url.startsWith(s))) return "neutral";
  let u;
  try {
    u = new URL(url);
  } catch {
    return "neutral";
  }
  return NEUTRAL_PAGES.some((match) => match(u)) ? "neutral" : null;
}

export function isUnsure({ label, confidence }, cfg) {
  return label === "unrelated" && confidence < cfg.unsureConfidence;
}

// A model answer holds for good; a fallback (model down, bad reply) only briefly,
// so a recovered model is asked again without calling it on every visit meanwhile.
export const FALLBACK_TTL_MS = 2 * 60 * 1000;
export function cacheUsable(entry, now) {
  if (!entry) return false;
  return entry.source !== "fallback" || now - entry.ts < FALLBACK_TTL_MS;
}
