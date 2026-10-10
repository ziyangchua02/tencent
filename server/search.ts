// Hybrid search: FTS5 keyword + optional Gemini text-embeddings (cosine similarity in JS).
// Falls back to keyword-only when no Gemini key is set.
import type { Pill } from '../shared/flow.ts';
import type { SearchHit, Chunk } from '../shared/retrieval-types.ts';
import type { Store } from './store.ts';

export interface FtsRow { id: string; pill_id: string; section: string; ordinal: number; text: string; score: number }

/** Build an FTS5 query from user input: use OR semantics on significant words. */
function ftsQuery(input: string): string {
  const stopwords = new Set(['a', 'an', 'the', 'do', 'does', 'is', 'are', 'was', 'were', 'how', 'what', 'why', 'who', 'when', 'where', 'i', 'you', 'we', 'they', 'it', 'this', 'that', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'but', 'with', 'from', 'about', 'can', 'should', 'would', 'could', 'will', 'my', 'our', 'their', 'be', 'have', 'has', 'had']);
  const cleaned = input.trim().toLowerCase().replace(/["*]/g, ' ').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const words = cleaned.split(' ').filter((w) => w.length > 1 && !stopwords.has(w));
  if (!words.length) return '';
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

/**
 * Optional: get text embeddings from Gemini. Returns null when no key is set.
 * Each vector is 768 dimensions (text-embedding-004). Cosine similarity in JS.
 */
async function embed(text: string, key: string): Promise<number[] | null> {
  const model = process.env.GEMINI_EMBED_MODEL?.trim() || 'text-embedding-004';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] }, taskType: 'RETRIEVAL_QUERY' }),
      signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 20_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { embedding?: { values?: number[] } };
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
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
  const qVec = await embed(query, key);
  if (!qVec) {
    return {
      hits: ftsRows.slice(0, limit).map((r) => toHit(r, 'fts5', -r.score)),
      usedEmbeddings: false,
      fallbackReason: 'Gemini embedding failed; keyword search only.',
    };
  }

  // Embed each FTS candidate chunk text and re-rank by cosine similarity.
  // This is O(n) API calls but n is small (≤30) and cached at the FTS level.
  const scored: { row: FtsRow; sim: number }[] = [];
  for (const row of ftsRows) {
    const vec = await embed(row.text, key);
    if (vec) scored.push({ row, sim: cosine(qVec, vec) });
    else scored.push({ row, sim: 0 });
  }
  scored.sort((a, b) => b.sim - a.sim);

  return {
    hits: scored.slice(0, limit).map((s) => {
      const alsoFts = true; // all candidates came from FTS5
      return toHit(s.row, alsoFts ? 'both' : 'embedding', s.sim);
    }),
    usedEmbeddings: true,
  };
}
