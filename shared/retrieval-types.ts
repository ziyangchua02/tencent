// Types shared between server and web for the retrieval layer.
// Chunks, search queries, answers and citations — all synthetic data.

import type { Role } from './flow.ts';

export interface Chunk {
  id: string;
  pillId: string;
  /** Section heading this chunk came from: "summary", "steps", "guardrails", "tools", "know-how", etc. */
  section: string;
  /** Ordinal within the section, for multi-paragraph sections like steps. */
  ordinal: number;
  text: string;
}

export interface SearchHit {
  chunk: Chunk;
  pillId: string;
  pillTitle: string;
  score: number;
  /** How the chunk was found: "fts5" (keyword), "embedding" (semantic), or "both". */
  matchedBy: 'fts5' | 'embedding' | 'both';
  snippet: string;
}

export interface Citation {
  pillId: string;
  pillTitle: string;
  section: string;
  text: string;
  /** 0-based index into the answer's sources list. */
  chunkId: string;
}

export interface Answer {
  text: string;
  citations: Citation[];
  /** When evidence is too weak, we refuse instead of guessing. */
  refused: boolean;
  reason: string;
  /** Which chunks were retrieved, ranked by score, before filtering. */
  sources: SearchHit[];
  /** Which model produced the answer: "gemini" or "rules". */
  reader: 'gemini' | 'rules';
  fallbackReason?: string;
}

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: Answer;
  question: string;
  at: string;
  actor: string;
  role: Role;
}

/** Minimum FTS5 bm25 score magnitude to consider a hit "strong enough". */
export const MIN_SCORE = -2.0;

/** Minimum number of strong hits to justify an answer (rather than refusing). */
export const MIN_HITS = 1;
