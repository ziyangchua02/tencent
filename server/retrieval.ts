// Governed retrieval: role/status filtering, answer synthesis, citations, refusal on weak evidence.
import type { Pill, Role } from '../shared/flow.ts';
import type { Answer, Citation, SearchHit } from '../shared/retrieval-types.ts';
import { hybridSearch, type SearchResult } from './search.ts';
import type { Store } from './store.ts';

/** Filter hits by role and pill status. */
export function filterByRole(hits: SearchHit[], pills: Pill[], _role: Role): SearchHit[] {
  const pillById = new Map(pills.map((p) => [p.id, p]));
  return hits.filter((h) => {
    const pill = pillById.get(h.pillId);
    if (!pill) return false;
    // Both roles can read approved and live pills.
    // Engineers and managers have equal read access to the pill library.
    return pill.status === 'approved' || pill.status === 'live';
  });
}

/** Build a clean answer from the top hits using rules-based synthesis (offline). */
function synthesizeRules(_question: string, hits: SearchHit[]): Answer {
  if (hits.length === 0) {
    return {
      text: '',
      citations: [],
      refused: true,
      reason: 'No chunks matched your question in the pill library. Try rephrasing, or check the library directly.',
      sources: [],
      reader: 'rules',
    };
  }

  const top = hits.slice(0, 3);
  const citations: Citation[] = top.map((h) => ({
    pillId: h.pillId,
    pillTitle: h.pillTitle,
    section: h.chunk.section,
    text: h.chunk.text,
    chunkId: h.chunk.id,
  }));

  // Build an answer string from the cited chunks, prefixed with which pill each came from.
  const parts = top.map((h) => {
    const section = h.chunk.section === 'summary' ? '' : ` (${h.chunk.section})`;
    return `From ${h.pillId} — "${h.pillTitle}"${section}: ${h.chunk.text}`;
  });

  return {
    text: parts.join('\n\n'),
    citations,
    refused: false,
    reason: 'Answered from pill library chunks.',
    sources: hits,
    reader: 'rules',
  };
}

/** Optionally use Gemini to synthesise a natural-language answer from retrieved chunks. */
async function synthesizeGemini(question: string, hits: SearchHit[], key: string): Promise<Answer> {
  if (hits.length === 0) {
    return {
      text: '',
      citations: [],
      refused: true,
      reason: 'No chunks matched your question in the pill library. Try rephrasing, or check the library directly.',
      sources: [],
      reader: 'gemini',
    };
  }

  const top = hits.slice(0, 5);
  const context = top.map((h, i) => `[${i + 1}] ${h.pillId} (${h.chunk.section}):\n${h.chunk.text}`).join('\n\n');
  const citations: Citation[] = top.map((h) => ({
    pillId: h.pillId,
    pillTitle: h.pillTitle,
    section: h.chunk.section,
    text: h.chunk.text,
    chunkId: h.chunk.id,
  }));

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
  const system = `You are a retrieval assistant in "Intelligence Pills", a building engineering knowledge system.
Answer the question using ONLY the provided pill library excerpts. Cite sources as [1], [2], etc.
If the excerpts don't contain enough to answer, say so plainly. All data is synthetic and labelled as such.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: `Question: ${question}\n\nPill library excerpts:\n${context}` }] }],
        generationConfig: { temperature: 0.2 },
        signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 20_000),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('empty answer');

    return {
      text: text.trim(),
      citations,
      refused: false,
      reason: 'Answered with Gemini from pill library chunks.',
      sources: hits,
      reader: 'gemini',
    };
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out' : e.message) : 'unknown error';
    const fallback = synthesizeRules(question, hits);
    return { ...fallback, fallbackReason: `Gemini didn't answer (${why}); used rules-based synthesis.` };
  }
}

export interface RetrievalResult {
  answer: Answer;
  search: SearchResult;
}

/**
 * Governed retrieval: search → filter by role/status → synthesise answer → cite or refuse.
 */
export async function ask(
  store: Store,
  question: string,
  pills: Pill[],
  role: Role,
): Promise<RetrievalResult> {
  const search = await hybridSearch(store, question, pills);

  // Filter by role and pill status
  const filtered = filterByRole(search.hits, pills, role);

  // Refuse on weak evidence: zero hits after filtering
  if (filtered.length === 0) {
    return {
      answer: {
        text: '',
        citations: [],
        refused: true,
        reason: 'No chunks matched your question in the pill library after permission filtering. Try rephrasing, or check the library directly.',
        sources: search.hits,
        reader: 'gemini',
        fallbackReason: search.fallbackReason,
      },
      search,
    };
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  let answer: Answer;
  if (key) {
    answer = await synthesizeGemini(question, filtered, key);
  } else {
    answer = synthesizeRules(question, filtered);
    answer.fallbackReason = search.fallbackReason ?? 'No Gemini key is set on the server; rules-based synthesis.';
  }

  return { answer, search };
}
