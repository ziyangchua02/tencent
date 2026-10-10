// Hybrid search: FTS5 keyword + optional Gemini text-embeddings (cosine similarity in JS).
// Falls back to keyword-only when no Gemini key is set.
import { createHash } from 'node:crypto';
import type { Pill } from '../shared/flow.ts';
import type { SearchHit, Chunk } from '../shared/retrieval-types.ts';
import type { Store } from './store.ts';

export interface FtsRow { id: string; pill_id: string; section: string; ordinal: number; text: string; score: number }

const STOPWORDS = new Set(['which', 'pill', 'pills', 'best', 'need', 'tell', 'show', 'give', 'please', 'any', 'there', 'much', 'many', 'a', 'an', 'the', 'do', 'does', 'is', 'are', 'was', 'were', 'how', 'what', 'why', 'who', 'when', 'where', 'i', 'you', 'we', 'they', 'it', 'this', 'that', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'but', 'with', 'from', 'about', 'can', 'should', 'would', 'could', 'will', 'my', 'our', 'their', 'be', 'have', 'has', 'had']);

/** The meaningful words in a question: lower-case, no stopwords. Shared by the keyword query and the confidence guard. */
export function queryTerms(input: string): string[] {
  const cleaned = input.trim().toLowerCase().replace(/["*]/g, ' ').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ');
  return cleaned ? cleaned.split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w)) : [];
}

/** Build an FTS5 query from user input: use OR semantics on significant words. */
function ftsQuery(input: string): string {
  const words = queryTerms(input);
  return words.map((w) => `"${w}"`).join(' OR ');
}

/** Build a snippet around the first match term, 200 chars. */
function snippet(text: string, query: string): string {
  const q = query.trim().toLowerCase();
  if (!q) return text.slice(0, 200);
  const idx = text.toLowerCase().indexOf(q.split(' ')[0]);
  if (idx < 0) return text.slice(0, 200);
  const start = Math.max(0, idx - 60);
  return (start > 0 ? '…' : '') + text.slice(start, start + 200) + (text.length > start + 200 ? '…' : '');
}

/** FTS5-only search. Returns hits sorted by BM25 rank (lower = better, so we negate). */
export function keywordSearch(store: Store, query: string, limit = 20): FtsRow[] {
  const fts = ftsQuery(query);
  if (!fts) return [];
  try {
    return store.searchFts(fts, limit);
  } catch {
    // FTS5 might fail on edge-case queries; return empty rather than crash.
    return [];
  }
}

const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const embedModel = () => process.env.GEMINI_EMBED_MODEL?.trim() || 'gemini-embedding-001';

/**
 * Embed texts with Gemini, one batch call for everything not already cached. A text that fails comes back null.
 * Vectors are cached by hash of model + task + text, so a pill chunk is embedded once, not on every question.
 */
export async function embedTexts(store: Store, texts: string[], key: string, taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'): Promise<(number[] | null)[]> {
  const model = embedModel();
  const keys = texts.map((t) => createHash('sha256').update(`${model}|${taskType}|${t}`).digest('hex'));
  const out: (number[] | null)[] = keys.map((k) => store.getVec(k));
  const todo = out.flatMap((v, i) => (v ? [] : [i]));
  for (let from = 0; from < todo.length; from += 100) {
    const slice = todo.slice(from, from + 100);
    try {
      const res = await fetch(`${EMBED_BASE}/${encodeURIComponent(model)}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ requests: slice.map((i) => ({ model: `models/${model}`, content: { parts: [{ text: texts[i] }] }, taskType })) }),
        signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 20_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { embeddings?: { values?: number[] }[] };
      slice.forEach((i, n) => {
        const v = data.embeddings?.[n]?.values;
        if (v?.length) { out[i] = v; store.putVec(keys[i], v); }
      });
    } catch { /* leave those texts null: the caller falls back to keywords */ }
  }
  return out;
}

/** Cosine similarity between two vectors. */
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export interface SearchResult {
  hits: SearchHit[];
  usedEmbeddings: boolean;
  /** Cosine similarity of the best chunk to the question. Only set when embeddings were used. */
  topSimilarity?: number;
  fallbackReason?: string;
}

/**
 * Hybrid search: run FTS5 first, then (optionally) re-rank top hits with embedding cosine similarity.
 * If the Gemini key is set, we embed the query and compare to each chunk text.
 * If not, or it fails, we fall back to FTS5-only.
 */
export async function hybridSearch(
  store: Store,
  query: string,
  pills: Pill[],
  limit = 10,
): Promise<SearchResult> {
  const ftsRows = keywordSearch(store, query, Math.max(limit * 3, 30));
  const pillById = new Map(pills.map((p) => [p.id, p]));

  const toHit = (r: FtsRow, matchedBy: SearchHit['matchedBy'], score: number): SearchHit => ({
    chunk: { id: r.id, pillId: r.pill_id, section: r.section, ordinal: r.ordinal, text: r.text } satisfies Chunk,
    pillId: r.pill_id,
    pillTitle: pillById.get(r.pill_id)?.title ?? r.pill_id,
    score,
    matchedBy,
    snippet: snippet(r.text, query),
  });

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    // FTS5-only fallback
    return {
      hits: ftsRows.slice(0, limit).map((r) => toHit(r, 'fts5', -r.score)),
      usedEmbeddings: false,
      fallbackReason: 'No Gemini key is set on the server; keyword search only.',
    };
  }

  // Try embedding the query
  const [qVec] = await embedTexts(store, [query], key, 'RETRIEVAL_QUERY');
  if (!qVec) {
    return {
      hits: ftsRows.slice(0, limit).map((r) => toHit(r, 'fts5', -r.score)),
      usedEmbeddings: false,
      fallbackReason: 'Gemini embedding failed; keyword search only.',
    };
  }

  // Embed the candidate chunks (one batch, cached) and re-rank by cosine similarity.
  const vecs = await embedTexts(store, ftsRows.map((r) => r.text), key, 'RETRIEVAL_DOCUMENT');
  if (vecs.some((v) => !v)) {
    return {
      hits: ftsRows.slice(0, limit).map((r) => toHit(r, 'fts5', -r.score)),
      usedEmbeddings: false,
      fallbackReason: 'Gemini embedding failed; keyword search only.',
    };
  }
  const scored = ftsRows.map((row, i) => ({ row, sim: cosine(qVec, vecs[i]!) })).sort((a, b) => b.sim - a.sim);

  return {
    hits: scored.slice(0, limit).map((s) => toHit(s.row, 'both', s.sim)), // every candidate came from FTS5
    usedEmbeddings: true,
    topSimilarity: scored[0]?.sim,
  };
}
