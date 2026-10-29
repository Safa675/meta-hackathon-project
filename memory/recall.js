// In-memory BM25 index over entries and notes, rebuilt from the store at load.
// Folding treats İ/I/ı/i as one letter and strips diacritics, so Turkish and
// English spellings ("ICP", "icp", "kesinti", "KESİNTİ") match each other.

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;

export function fold(s) {
  return s.replace(/[İIı]/g, "i").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

// URL debris: matches any note that contains a link, so it carries no meaning.
const STOP = new Set(["com", "www", "http", "https", "org", "net", "html"]);

export function tokenize(s) {
  return fold(s ?? "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t));
}

// "www.youtube.com" -> "youtube", "mail.google.com" -> "mail google", "x.com.tr" -> "x".
export function hostWords(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return "";
  }
  const labels = host.split(".").filter((l) => l !== "www");
  labels.pop(); // TLD
  if (labels.length > 1 && ["co", "com", "org", "net", "gov", "edu"].includes(labels.at(-1))) labels.pop();
  return labels.join(" ");
}

export const entryDoc = (e) => ({
  ref: { type: "entry", id: e.id },
  title: e.title,
  text: [e.topic, e.context, e.result, e.evidence, e.next].join("\n"),
  item: e,
});

export const noteDoc = (d) => ({ ref: { type: "note", path: d.path }, title: d.title, text: d.text, item: d });

// An entry's topic, or for a note the folder under notes/ (notes/topics/<name>.md counts as <name>).
export function topicOf(doc) {
  if (doc.ref.type === "entry") return doc.item.topic;
  const [, first, second] = doc.ref.path.split("/");
  if (!second) return "general";
  return first === "topics" ? second.replace(/\.md$/, "") : first;
}

export function buildIndex(docs) {
  const postings = new Map(); // term -> Map(docIndex -> weighted tf)
  const lengths = [];
  docs.forEach((doc, i) => {
    const tf = new Map();
    for (const t of tokenize(doc.title)) tf.set(t, (tf.get(t) ?? 0) + TITLE_WEIGHT);
    for (const t of tokenize(doc.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    let len = 0;
    for (const [t, n] of tf) {
      len += n;
      if (!postings.has(t)) postings.set(t, new Map());
      postings.get(t).set(i, n);
    }
    lengths.push(len);
  });
  const avgdl = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  return { docs, postings, lengths, avgdl };
}

// filter: optional (doc) => boolean, applied before ranking.
export function search(index, query, { limit = 10, filter } = {}) {
  const { docs, postings, lengths, avgdl } = index;
  const scores = new Map();
  for (const t of new Set(tokenize(query))) {
    const p = postings.get(t);
    if (!p) continue;
    const idf = Math.log(1 + (docs.length - p.size + 0.5) / (p.size + 0.5));
    for (const [i, tf] of p) {
      if (filter && !filter(docs[i])) continue;
      const s = idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * lengths[i]) / avgdl)));
      scores.set(i, (scores.get(i) ?? 0) + s);
    }
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i, score]) => ({ ...docs[i], score }));
}

// Share of a topic slug's words that appear in the query: "meta-hackathon" is
// fully named by "meta-hackathon-project", half named by "Meta Muse".
export function slugMatch(topic, queryTokens) {
  const parts = tokenize(topic.replace(/-/g, " "));
  return parts.length ? parts.filter((p) => queryTokens.has(p)).length / parts.length : 0;
}

// Ranks like search(), then boosts hits whose topic the query names or that the
// caller marks as current (the stated intent's topic). Loose keyword hits from an
// unrelated topic sink below the boosted ones; nothing is excluded, and the same
// entries rise when the activity is about their topic.
export function topicSearch(index, query, { limit = 10, filter, topics = [], boost = 2 } = {}) {
  const q = new Set(tokenize(query));
  return search(index, query, { limit: Infinity, filter })
    .map((d) => {
      const t = topicOf(d);
      const named = Math.max(slugMatch(t, q), topics.includes(t) ? 1 : 0);
      return { ...d, score: d.score * (1 + boost * named) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
