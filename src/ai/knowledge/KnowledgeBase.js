import { chunk } from './chunker.js';
import { buildIndex, search, tokenize } from './bm25.js';

/**
 * Loads the local knowledge pack and answers retrieval queries over it.
 * No pack installed is a normal state: retrieve() then reports no knowledge, and the prompt
 * rules keep the model from answering ISU-specific questions from memory.
 *
 * A hit counts as reliable by how much of the question it covers, not by its BM25 score: the score
 * depends on the size of the pack (a one-document pack scores near zero), so no fixed score works.
 *
 * shortcut: MIN_COVERAGE is a judgement call, checked only against the test fixture. Re-tune it in
 * Phase 7 against the collected student questions (README 8.10) before the pack grows.
 */
const MIN_COVERAGE = 0.5;
const MAX_CONTEXT_CHARS = 2400;

/** Only verified, in-date documents may be used as current policy (README 7.3, 8.5). */
export function isCurrent(doc, today = new Date().toISOString().slice(0, 10)) {
  if (doc?.status !== 'verified') return false;
  return !doc.expirationDate || doc.expirationDate >= today;
}

async function fetchPack() {
  const base = import.meta.env.BASE_URL;
  const get = async (name) => {
    const res = await fetch(`${base}knowledge/${name}`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return res.json();
  };
  const [manifest, documents] = await Promise.all([get('manifest.json'), get('documents.json')]);
  return { manifest, documents };
}

export class KnowledgeBase {
  constructor({ source = fetchPack } = {}) {
    this.source = source;
    this.manifest = null;
    this.index = null;
    this.pending = null;
  }

  /** Resolves true when a pack is installed and indexed. Safe to call repeatedly. */
  async load() {
    if (this.index) return true;
    // Cache the promise so two callers share one load, but drop it on failure so a retry can work.
    this.pending ??= this.source()
      .then(({ manifest, documents }) => {
        const current = (documents ?? []).filter((d) => isCurrent(d));
        this.manifest = manifest ?? null;
        this.index = buildIndex(current.flatMap(chunk));
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  get packVersion() {
    return this.manifest?.packVersion ?? null;
  }

  /**
   * Find sections that support an answer.
   * `reliable` false means: do not answer this as ISU policy, and attach no citations.
   */
  async retrieve(question, { k = 3 } = {}) {
    const hasKnowledge = await this.load();
    if (!hasKnowledge) return { hasKnowledge: false, reliable: false, hits: [] };

    const found = search(this.index, question, k);
    const terms = new Set(tokenize(question)).size;
    if (!found.length || !terms || found[0].matched / terms < MIN_COVERAGE) {
      return { hasKnowledge: true, reliable: false, hits: [] };
    }

    const hits = [];
    let used = 0;
    for (const hit of found) {
      if (hits.length && used + hit.text.length > MAX_CONTEXT_CHARS) break;
      hits.push(hit);
      used += hit.text.length;
    }
    return { hasKnowledge: true, reliable: true, hits };
  }
}

export const knowledgeBase = new KnowledgeBase();
