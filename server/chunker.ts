// Chunk pill JSON by section for FTS5 indexing and retrieval.
// Each chunk is a (section, ordinal) slice of a pill's structured content.
import type { Pill } from '../shared/flow.ts';
import type { Chunk } from '../shared/retrieval-types.ts';

export function chunkPill(pill: Pill): Chunk[] {
  const chunks: Chunk[] = [];
  const pid = pill.id;

  const push = (section: string, ordinal: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    chunks.push({
      id: `${pid}:${section}:${ordinal}`,
      pillId: pid,
      section,
      ordinal,
      text: trimmed,
    });
  };

  push('summary', 0, `${pill.title}. ${pill.summary}`);
  push('metadata', 0, [
    `Domain: ${pill.domain}.`,
    `System: ${pill.system}.`,
    `Sites: ${pill.sites.join(', ')}.`,
    `Status: ${pill.status}.`,
    `Owner: ${pill.owner.name}, ${pill.owner.title}, ${pill.owner.site}.`,
    pill.tags.length ? `Tags: ${pill.tags.join(', ')}.` : '',
  ].join(' ').trim());

  pill.steps.forEach((s, i) => push('steps', i, `Step ${i + 1}: ${s}`));
  pill.guardrails.forEach((g, i) => push('guardrails', i, `Guardrail ${i + 1}: ${g}`));
  if (pill.tools.length) push('tools', 0, `Tools: ${pill.tools.join(', ')}.`);
  pill.knowHow?.forEach((k, i) => push('know-how', i, `Q: ${k.question}\nA: ${k.answer}`));
  pill.composedOf?.length && push('composed-of', 0, `Composed of: ${pill.composedOf.join(', ')}.`);
  pill.checks?.length && push('checks', 0, `Required checks: ${pill.checks.join(', ')}.`);
  pill.revisions.forEach((r, i) => push('revisions', i, `Revision ${r.rev}: ${r.note} (${r.date}, by ${r.by}).`));
  pill.ratings.forEach((r, i) => push('ratings', i, `Rating ${r.rating}/5 by ${r.by} on ${r.at}: ${r.reason}.`));

  return chunks;
}
