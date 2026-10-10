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
  /** 0 to 1: how well the evidence covers the question. Only set when an answer was given. */
  confidence?: number;
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

/** Keyword-only guard: the share of a question's meaningful words that must appear in the evidence. */
export const MIN_TERM_COVERAGE = 0.5;

/**
 * Embedding guard (gemini-embedding-001 cosine). Calibrated on 18 questions against the 5 seeded pills: real questions scored
 * 0.70 to 0.82, off-topic ones that share a word scored 0.64 to 0.67. A small sample: re-check after the library grows.
 * Under this the best chunk is not about the question.
 */
export const MIN_SIMILARITY = 0.69;
/** At or above this, a question phrased in different words from the pill is still accepted. */
export const CONFIDENT_SIMILARITY = 0.72;
