// In-memory BM25 index over entries and notes, rebuilt from the store at load.
// Folding treats İ/I/ı/i as one letter and strips diacritics, so Turkish and
// English spellings ("ICP", "icp", "kesinti", "KESİNTİ") match each other.

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;

export function fold(s) {
  return s.replace(/[İIı]/g, "i").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function tokenize(s) {
  return fold(s ?? "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
}

export const entryDoc = (e) => ({
  ref: { type: "entry", id: e.id },
  title: e.title,
  text: [e.topic, e.context, e.result, e.evidence, e.next].join("\n"),
  item: e,
});

export const noteDoc = (d) => ({ ref: { type: "note", path: d.path }, title: d.title, text: d.text, item: d });

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
