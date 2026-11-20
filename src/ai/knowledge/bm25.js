/**
 * BM25 keyword search over pack chunks (README 7.3 starts with keyword search, not embeddings).
 * Small enough to run on the main thread for a v0.1 pack of a few hundred sections.
 */
const K1 = 1.2;
const B = 0.75;

// Words that carry no meaning for retrieval. English plus the common Filipino function words,
// because students ask in both.
const STOP = new Set(
  `a an the and or but if then than that this these those is are was were be been being am
   of in on at to for from by with without about into over under as it its it's there here
   i me my we our you your he she they them his her their do does did doing done have has had
   can could should would will shall may might must not no nor so such own same too very
   what which who whom whose when where why how all any both each few more most other some
   ang mga ng sa na ay at o kung para ko ako kami kayo sila niya nila ito iyon yan yun po ba
   may mayroon wala hindi oo ano sino saan kailan paano bakit alin kanino ninyo namin natin`
    .split(/\s+/)
    .filter(Boolean)
);

/** Drop a plural "s" so "requirements" matches "requirement". No real stemmer; see the spec. */
const stem = (t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

export function tokenize(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => !STOP.has(w)).map(stem);
}

export function buildIndex(chunks) {
  const docs = chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.heading} ${chunk.text}`);
    const counts = new Map();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    return { chunk, counts, length: tokens.length };
  });

  const df = new Map();
  for (const doc of docs) for (const t of doc.counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLength = docs.reduce((n, d) => n + d.length, 0) / (docs.length || 1);
  return { docs, df, avgLength };
}

/** Returns the top `k` chunks with a score above zero, best first. */
export function search(index, query, k = 3) {
  const terms = tokenize(query);
  if (!terms.length || !index.docs.length) return [];
  const N = index.docs.length;

  const scored = index.docs.map(({ chunk, counts, length }) => {
    let score = 0;
    let matched = 0;
    for (const term of new Set(terms)) {
      const tf = counts.get(term);
      if (!tf) continue;
      matched++;
      const idf = Math.log(1 + (N - index.df.get(term) + 0.5) / (index.df.get(term) + 0.5));
      score += (idf * (tf * (K1 + 1))) / (tf + K1 * (1 - B + (B * length) / index.avgLength));
    }
    return { ...chunk, score, matched };
  });

  return scored
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId))
    .slice(0, k);
}
