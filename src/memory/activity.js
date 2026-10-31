// Raw activity events → time spans → per-site summary. Pure.
// Event: { ts, url, title, kind } where kind is "focus" (a page became active)
// or "idle" (the user went idle, locked the screen or left the browser).
// An event lasts until the next one. Time away should arrive as an "idle" event
// (window blur, screen lock); IDLE_GAP only caps a page whose closing event never
// came (browser crash, sleep), so long reading or a video still counts in full.

export const IDLE_GAP = 30 * 60 * 1000;

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function toSpans(events, now = Date.now(), { idleGap = IDLE_GAP } = {}) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const spans = [];
  sorted.forEach((e, i) => {
    if (e.kind === "idle") return;
    const ms = Math.min((sorted[i + 1]?.ts ?? now) - e.ts, idleGap);
    if (ms <= 0) return;
    const last = spans.at(-1);
    // Consecutive events on the same page (title updates, reloads) are one span.
    if (last && last.url === e.url && last.start + last.ms === e.ts) {
      last.ms += ms;
      last.title = e.title || last.title;
    } else {
      spans.push({ start: e.ts, ms, url: e.url, title: e.title ?? "", host: hostOf(e.url) });
    }
  });
  return spans;
}

// Keeps only the part of each span after `from` (a span can start before the window).
export function clipSpans(spans, from) {
  return spans
    .map((s) => (s.start >= from ? s : { ...s, start: from, ms: s.ms - (from - s.start) }))
    .filter((s) => s.ms > 0);
}

export function summarize(spans) {
  const byHost = new Map();
  for (const s of spans) {
    const h = byHost.get(s.host) ?? { host: s.host, ms: 0, titles: new Map() };
    h.ms += s.ms;
    h.titles.set(s.title, (h.titles.get(s.title) ?? 0) + s.ms);
    byHost.set(s.host, h);
  }
  const sites = [...byHost.values()]
    .map((h) => ({
      host: h.host,
      ms: h.ms,
      titles: [...h.titles].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter(Boolean),
    }))
    .sort((a, b) => b.ms - a.ms);
  return { totalMs: sites.reduce((a, s) => a + s.ms, 0), sites };
}

const mins = (ms) => (ms < 30000 ? "<1 min" : `${Math.round(ms / 60000)} min`);

export function renderSummary(summary, windowMs, { sites = 6, titles = 2 } = {}) {
  if (!summary.sites.length) return `Last ${mins(windowMs)}: no browser activity.`;
  const lines = summary.sites.slice(0, sites).map((s) => {
    const t = s.titles.slice(0, titles).map((x) => `"${x}"`).join(", ");
    return `- ${s.host}: ${mins(s.ms)}${t ? ` (${t})` : ""}`;
  });
  return [`Last ${mins(windowMs)} (${mins(summary.totalMs)} active):`, ...lines].join("\n");
}
