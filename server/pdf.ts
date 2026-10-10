// Generate a PDF from a pill's JSON using pdf-lib (pure JS, no native bindings).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Pill } from '../shared/flow.ts';
import { currentRev } from '../shared/flow.ts';

const MARGIN = 50;
const PAGE_W = 595.28; // A4 width in points
const PAGE_H = 841.89;

function wrap(font: { widthOfTextAtSize: (t: string, s: number) => number }, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function generatePillPdf(pill: Pill): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxW = PAGE_W - MARGIN * 2;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const h = (s: number) => { y -= s; if (y < MARGIN + 40) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } };
  const text = (t: string, size = 10, color = rgb(0.09, 0.13, 0.17)) => {
    for (const ln of wrap(font, t, size, maxW)) { h(size + 4); page.drawText(ln, { x: MARGIN, y, size, font, color }); }
  };
  const heading = (t: string) => {
    h(24);
    page.drawText(t, { x: MARGIN, y, size: 13, font: bold, color: rgb(0.05, 0.21, 0.34) });
    h(4);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.8, 0.83, 0.85) });
  };

  // Header
  page.drawText(pill.id, { x: MARGIN, y: PAGE_H - 30, size: 9, font, color: rgb(0.37, 0.29, 0.42) });
  page.drawText(`Revision ${currentRev(pill)} · ${pill.status.toUpperCase()}`, { x: PAGE_W - MARGIN - 150, y: PAGE_H - 30, size: 9, font: bold, color: rgb(0.05, 0.21, 0.34) });
  h(20);
  heading(pill.title);
  text(pill.summary, 10, rgb(0.37, 0.29, 0.42));

  const kv = (label: string, val: string) => {
    h(14);
    page.drawText(label, { x: MARGIN, y, size: 9, font: bold, color: rgb(0.37, 0.29, 0.42) });
    page.drawText(val, { x: MARGIN + 90, y, size: 9, font, color: rgb(0.09, 0.13, 0.17) });
  };
  kv('Domain', pill.domain);
  kv('System', pill.system);
  kv('Owner', `${pill.owner.name} (${pill.owner.title})`);
  kv('Sites', pill.sites.join(', ') || '—');
  if (pill.tags.length) kv('Tags', pill.tags.join(', '));

  heading('Steps');
  pill.steps.forEach((s, i) => text(`${i + 1}. ${s}`));

  heading('Guardrails');
  pill.guardrails.forEach((g) => text(`• ${g}`));

  heading('Tools');
  text(pill.tools.join(', ') || '—');

  if (pill.composedOf?.length) { heading('Built from the library'); text(pill.composedOf.join(', ')); }
  if (pill.checks?.length) { heading('Required checks before execution'); text(pill.checks.join(', ')); }
  if (pill.knowHow?.length) {
    heading('Captured know-how');
    pill.knowHow.forEach((k) => { text(`Q: ${k.question}`); text(`A: ${k.answer}`); h(6); });
  }

  heading('Revisions');
  pill.revisions.forEach((r) => text(`Rev ${r.rev} (${r.date}, ${r.by}): ${r.note}`));

  if (pill.ratings.length) {
    heading('Health ratings');
    pill.ratings.forEach((r) => text(`${r.rating}/5 by ${r.by} on ${r.at}: ${r.reason}`));
  }

  // Footer on every page
  for (const p of doc.getPages()) {
    p.drawText(`${pill.id} · Synthetic data · Intelligence Pills`, { x: MARGIN, y: 25, size: 7, font, color: rgb(0.55, 0.42, 0.58) });
  }

  return doc.save();
}
