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

// Cache key: one judgment per goal and page.
export function relevanceKey(intentId, url, title) {
  return `${intentId}|${hostOf(url)}|${normalizeTitle(title)}`;
}

// User labels, most specific first. On sites where one host holds work and
// play (YouTube), a label sticks to the title; elsewhere to the host.
export function labelKeys(topic, url, title) {
  const host = hostOf(url);
  return TITLE_SENSITIVE.includes(host)
    ? [`${topic}|${host}|${normalizeTitle(title)}`, `${topic}|${host}`]
    : [`${topic}|${host}`];
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
