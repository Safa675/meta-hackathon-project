// The popup's "Last 30 minutes" list: memory's activity spans → one row per site.
// Pure, so it is tested in node.

const WEB = /^https?:/;
const M = 60 * 1000;

const readable = (ms) => (ms < 30 * 1000 ? "<1 min" : `${Math.round(ms / M)} min`);

// spans: [{url, title, ms, host}] → [{site, time, title, share}] with share relative to the top site.
export function activityRows(spans, { limit = 5 } = {}) {
  const bySite = new Map();
  for (const s of spans) {
    if (!WEB.test(s.url ?? "")) continue; // new tab, settings, extension pages
    const row = bySite.get(s.host) ?? { site: s.host, ms: 0, titles: new Map() };
    row.ms += s.ms;
    if (s.title) row.titles.set(s.title, (row.titles.get(s.title) ?? 0) + s.ms);
    bySite.set(s.host, row);
  }
  const rows = [...bySite.values()].sort((a, b) => b.ms - a.ms).slice(0, limit);
  const top = rows[0]?.ms || 1;
  return rows.map((r) => ({
    site: r.site,
    time: readable(r.ms),
    title: [...r.titles].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    share: r.ms / top,
  }));
}
