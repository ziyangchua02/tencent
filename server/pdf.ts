// Pill PDF: page 1 is the manager summary (what it is, what it does to Tower A), the pages after it are the field checklist.
// pdf-lib draws it, with DejaVu Sans embedded so ° − ≥ → ★ render; glyphs the font lacks (CJK, emoji) print as "?".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Pill } from '../shared/flow.ts';
import { currentRev, health, systemName } from '../shared/flow.ts';
import {
  baseline, BOARD_NAMES, BOARDS, reviewAgents, settingsFor, simulateMeasures, TOWER,
  type MeasureId, type SimResult,
} from '../shared/model.ts';

/** Written into every PDF's catalog, so stored PDFs made by an older layout are regenerated. */
export const PDF_LAYOUT_MARK = 'ip-layout-2';
// A PDF name is stored as plain text, unlike keywords, which pdf-lib hex-encodes.
export const hasCurrentLayout = (pdf: Uint8Array) => Buffer.from(pdf).includes(`/${PDF_LAYOUT_MARK}`);

const ASSETS = join(import.meta.dirname, 'assets');
const FONT_BYTES = { regular: readFileSync(join(ASSETS, 'DejaVuSans.ttf')), bold: readFileSync(join(ASSETS, 'DejaVuSans-Bold.ttf')) };

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const M = 44;
const W = PAGE_W - M * 2;
const FOOT = 52; // space kept free above the footer

const C = {
  ink: rgb(0.09, 0.13, 0.17), mute: rgb(0.37, 0.42, 0.47), navy: rgb(0.05, 0.21, 0.34), rule: rgb(0.8, 0.83, 0.85),
  panel: rgb(0.95, 0.96, 0.97), white: rgb(1, 1, 1), red: rgb(0.74, 0.1, 0.2), green: rgb(0.1, 0.45, 0.28),
  amber: rgb(0.72, 0.45, 0.05), blue: rgb(0.1, 0.36, 0.78), gold: rgb(0.78, 0.5, 0.05), redWash: rgb(0.99, 0.94, 0.94),
};

// ---------- what the simulator says about this pill ----------

/** The measures to re-simulate for a pill, or none when the Tower A simulator does not model it. */
export function simulatedMeasures(pill: Pill): MeasureId[] {
  if (pill.measures?.length) return pill.measures;
  return pill.measureId ? [pill.measureId] : [];
}

export interface PillEvidence { base: SimResult; fix: SimResult; verdicts: { agent: string; verdict: string }[] }
/** Re-simulated, never stored: the numbers in the PDF come from the same model the app uses. */
export function pillEvidence(pill: Pill): PillEvidence | null {
  const measures = simulatedMeasures(pill);
  if (!measures.length) return null;
  const base = baseline();
  const fix = simulateMeasures(measures, settingsFor(pill.tuning));
  return { base, fix, verdicts: reviewAgents(base, fix).comments.map((c) => ({ agent: c.agent, verdict: c.verdict })) };
}

// ---------- drawing helpers ----------

class Doc {
  readonly pdf: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;
  private chars!: Set<number>;
  private constructor(pdf: PDFDocument) { this.pdf = pdf; }

  static async create() {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const d = new Doc(pdf);
    d.font = await pdf.embedFont(FONT_BYTES.regular, { subset: true });
    d.bold = await pdf.embedFont(FONT_BYTES.bold, { subset: true });
    d.chars = new Set(d.font.getCharacterSet());
    d.newPage();
    return d;
  }

  /** Replace what the font cannot draw, so engineer-written text never makes generation throw. */
  clean(t: string) {
    return [...t.replace(/\r/g, '').replace(/\t/g, ' ')].map((ch) => (ch === '\n' || this.chars.has(ch.codePointAt(0)!) ? ch : '?')).join('');
  }

  newPage() { this.page = this.pdf.addPage([PAGE_W, PAGE_H]); this.y = PAGE_H - M; }
  /** Start a new page unless `h` points still fit above the footer. */
  ensure(h: number) { if (this.y - h < FOOT + M / 2) this.newPage(); }

  wrap(t: string, size: number, width: number, font = this.font): string[] {
    const out: string[] = [];
    for (const para of this.clean(t).split('\n')) {
      let line = '';
      for (let word of para.split(' ')) {
        // A word wider than the line is cut at the line width.
        while (font.widthOfTextAtSize(word, size) > width) {
          let n = word.length;
          while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > width) n--;
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, n));
          word = word.slice(n);
        }
        const test = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(test, size) > width) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  /** Draw wrapped text at (x, y-top). Returns the height used. */
  text(t: string, x: number, top: number, o: { size?: number; width?: number; bold?: boolean; color?: ReturnType<typeof rgb>; lead?: number } = {}) {
    const size = o.size ?? 9.5;
    const lead = o.lead ?? size * 1.4;
    const font = o.bold ? this.bold : this.font;
    const lines = this.wrap(t, size, o.width ?? W, font);
    lines.forEach((ln, i) => this.page.drawText(ln, { x, y: top - size - i * lead, size, font, color: o.color ?? C.ink }));
    return lines.length * lead;
  }

  /** A paragraph at the cursor, moving the cursor down. */
  para(t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number } = {}) {
    const size = o.size ?? 9.5;
    const lines = this.wrap(t, size, o.width ?? W, o.bold ? this.bold : this.font).length;
    this.ensure(lines * size * 1.4);
    this.y -= this.text(t, o.x ?? M, this.y, o);
  }

  heading(t: string, keepWith = 50) {
    this.ensure(30 + keepWith);
    this.y -= 14;
    this.page.drawText(this.clean(t), { x: M, y: this.y - 12, size: 12, font: this.bold, color: C.navy });
    this.y -= 18;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, thickness: 0.6, color: C.rule });
    this.y -= 6;
  }

  stars(x: number, y: number, n: number, size = 10) {
    for (let i = 0; i < 5; i++) this.page.drawText(i < n ? '★' : '☆', { x: x + i * (size + 1.5), y, size, font: this.font, color: i < n ? C.gold : C.rule });
  }
}

/** Resolve a pill id to its title, for "run PILL-xxxx first" lines. */
export const titleLookup = (pills: Pill[]) => (id: string) => pills.find((p) => p.id === id)?.title ?? id;

const stat = (n: number, d = 0) => n.toLocaleString('en-SG', { minimumFractionDigits: d, maximumFractionDigits: d });
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const pillUrl = (id: string) => `${process.env.APP_URL?.trim().replace(/\/$/, '') ?? ''}/pills/${id}`;

function header(d: Doc, pill: Pill) {
  const p = d.page;
  p.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: C.navy });
  p.drawText(`${pill.id}  ·  INTELLIGENCE PILL`, { x: M, y: PAGE_H - 26, size: 8.5, font: d.bold, color: rgb(0.7, 0.8, 0.9) });
  const titleLines = d.wrap(pill.title, 17, W - 130, d.bold).slice(0, 2);
  titleLines.forEach((ln, i) => p.drawText(ln, { x: M, y: PAGE_H - 48 - i * 21, size: 17, font: d.bold, color: C.white }));
  // status as a word on a chip, never colour alone
  const word = pill.status.toUpperCase();
  const w = d.bold.widthOfTextAtSize(word, 10) + 20;
  p.drawRectangle({ x: PAGE_W - M - w, y: PAGE_H - 40, width: w, height: 20, color: pill.status === 'live' ? C.green : C.blue });
  p.drawText(word, { x: PAGE_W - M - w + 10, y: PAGE_H - 34, size: 10, font: d.bold, color: C.white });
  const updated = pill.revisions.at(-1)?.date ?? '';
  p.drawText(`Revision ${currentRev(pill)} · updated ${updated}`, { x: PAGE_W - M - 150, y: PAGE_H - 62, size: 8.5, font: d.font, color: rgb(0.8, 0.88, 0.95) });
  // synthetic-data marker, as visible as the title
  p.drawRectangle({ x: M, y: PAGE_H - 116, width: W, height: 18, color: C.redWash, borderColor: C.red, borderWidth: 0.8 });
  p.drawText('SYNTHETIC DATA · NOT KEPPEL DATA · DEMONSTRATION ONLY', { x: M + 8, y: PAGE_H - 110, size: 8.5, font: d.bold, color: C.red });
  d.y = PAGE_H - 130;
}

function glance(d: Doc, pill: Pill) {
  d.para(pill.summary, { size: 10.5, color: C.mute });
  d.y -= 6;
  const rows: [string, string][] = [
    ['Owner', `${pill.owner.name}, ${pill.owner.title}`],
    ['Sites', pill.sites.join(', ') || 'Approved, not yet live'],
    ['System', pill.system],
    ['Domain', pill.domain],
    ['Applies to', pill.tags.map(systemName).join(' · ') || '—'],
  ];
  const colW = (W - 24) / 2;
  const heights = rows.map(([, v]) => d.wrap(v, 9, colW - 62).length * 12.6);
  const boxH = 20 + Math.max(heights[0] + heights[2] + heights[4] + 8, heights[1] + heights[3] + 8 + 14);
  d.ensure(boxH);
  const top = d.y;
  d.page.drawRectangle({ x: M, y: top - boxH, width: W, height: boxH, color: C.panel, borderColor: C.rule, borderWidth: 0.6 });
  let yL = top - 10, yR = top - 10;
  const put = (x: number, label: string, v: string, y: number) => {
    d.page.drawText(label.toUpperCase(), { x, y: y - 8, size: 7, font: d.bold, color: C.mute });
    return d.text(v, x + 62, y, { size: 9, width: colW - 62 });
  };
  yL -= put(M + 10, rows[0][0], rows[0][1], yL) + 4;
  yL -= put(M + 10, rows[2][0], rows[2][1], yL) + 4;
  yL -= put(M + 10, rows[4][0], rows[4][1], yL);
  yR -= put(M + 12 + colW, rows[1][0], rows[1][1], yR) + 4;
  yR -= put(M + 12 + colW, rows[3][0], rows[3][1], yR) + 4;
  const n = health(pill);
  d.page.drawText('HEALTH', { x: M + 12 + colW, y: yR - 10, size: 7, font: d.bold, color: C.mute });
  if (n === null) d.page.drawText('Not rated yet', { x: M + 12 + colW + 62, y: yR - 10, size: 9, font: d.font, color: C.ink });
  else {
    d.stars(M + 12 + colW + 62, yR - 11, n, 10);
    d.page.drawText(`${n}/5 · manager's latest rating`, { x: M + 12 + colW + 62 + 62, y: yR - 10, size: 8.5, font: d.font, color: C.ink });
  }
  d.y = top - boxH - 4;
}

/** Whole-building demand over the working day: today against with-this-pill, with the contracted cap. */
function chart(d: Doc, ev: PillEvidence, caption: string) {
  const H = 150, left = 44, right = 8, bottom = 22, top = 8;
  d.ensure(H + 44);
  const x0 = M + left, x1 = M + W - right, y0 = d.y - H + bottom, y1 = d.y - top;
  const [h0, h1] = [5, 20];
  const peak = Math.max(ev.base.peakKw, ev.fix.peakKw, TOWER.contractedCapacityKw);
  const yMax = Math.ceil((peak * 1.05) / 500) * 500;
  const X = (h: number) => x0 + ((h - h0) / (h1 - h0)) * (x1 - x0);
  const Y = (kw: number) => y0 + (kw / yMax) * (y1 - y0);
  const p = d.page;
  for (let kw = 0; kw <= yMax; kw += 1000) {
    p.drawLine({ start: { x: x0, y: Y(kw) }, end: { x: x1, y: Y(kw) }, thickness: 0.4, color: C.rule });
    p.drawText(stat(kw), { x: M, y: Y(kw) - 3, size: 7, font: d.font, color: C.mute });
  }
  for (let h = h0; h <= h1; h += 3) p.drawText(hhmm(h), { x: X(h) - 9, y: y0 - 12, size: 7, font: d.font, color: C.mute });
  p.drawText('kW', { x: M, y: y1 + 1, size: 7, font: d.bold, color: C.mute });
  const line = (r: SimResult, color: ReturnType<typeof rgb>, thickness: number) => {
    const pts = r.series.filter((s) => s.t >= h0 && s.t <= h1);
    for (let i = 1; i < pts.length; i++) p.drawLine({ start: { x: X(pts[i - 1].t), y: Y(pts[i - 1].msb) }, end: { x: X(pts[i].t), y: Y(pts[i].msb) }, thickness, color });
  };
  line(ev.base, C.mute, 1.2);
  line(ev.fix, C.blue, 1.8);
  p.drawLine({ start: { x: x0, y: Y(TOWER.contractedCapacityKw) }, end: { x: x1, y: Y(TOWER.contractedCapacityKw) }, thickness: 1, color: C.red, dashArray: [4, 3] });
  p.drawText(`Contracted capacity ${stat(TOWER.contractedCapacityKw)} kW`, { x: x1 - 118, y: Y(TOWER.contractedCapacityKw) + 3, size: 7, font: d.bold, color: C.red });
  d.y -= H + 4;
  // legend uses words as well as colour
  const leg = (x: number, color: ReturnType<typeof rgb>, label: string, dash = false) => {
    p.drawLine({ start: { x, y: d.y - 4 }, end: { x: x + 16, y: d.y - 4 }, thickness: 1.6, color, dashArray: dash ? [4, 3] : undefined });
    p.drawText(label, { x: x + 20, y: d.y - 7, size: 7.5, font: d.font, color: C.ink });
  };
  leg(M + left, C.mute, `Today · peak ${stat(ev.base.peakKw)} kW`);
  leg(M + left + 135, C.blue, `With this pill · peak ${stat(ev.fix.peakKw)} kW`);
  leg(M + left + 300, C.red, 'Contracted capacity', true);
  d.y -= 14;
  d.para(caption, { size: 8.5, color: C.mute });
}

function evidence(d: Doc, pill: Pill) {
  d.heading('What it does to Tower A (this pill on its own)', 190);
  const ev = pillEvidence(pill);
  if (!ev) {
    d.para('No simulation evidence: this pill is not modelled by the Tower A simulator. Its value is the procedure, checks and guardrails on the following pages.', { color: C.mute });
    return;
  }
  const { base, fix } = ev;
  const worst = BOARDS.reduce((a, b) => (fix.maxBoardPct[b] > fix.maxBoardPct[a] ? b : a));
  const dPeak = fix.peakKw - base.peakKw;
  chart(d, ev, `Chart summary: weekday whole-building demand from 05:00 to 20:00. Peak ${stat(base.peakKw)} kW today, ${stat(fix.peakKw)} kW with this pill (${Math.abs(dPeak) < 0.5 ? 'unchanged' : `${dPeak < 0 ? 'down' : 'up'} ${stat(Math.abs(dPeak))} kW`}), against a ${stat(TOWER.contractedCapacityKw)} kW cap. Re-simulated from the Tower A model, not typed in.`);
  d.y -= 4;
  const rows: [string, string, string][] = [
    ['Peak demand', `${stat(base.peakKw)} kW at ${hhmm(base.peakAtHour)}`, `${stat(fix.peakKw)} kW at ${hhmm(fix.peakAtHour)}`],
    ['Energy per day', `${stat(base.totalKwh)} kWh`, `${stat(fix.totalKwh)} kWh`],
    ['Energy cost per day (synthetic tariff)', `$${stat(base.costUsd, 2)}`, `$${stat(fix.costUsd, 2)}`],
    ['Floors that may be too warm', `${stat(base.comfortHoursAtRisk, 1)} h`, `${stat(fix.comfortHoursAtRisk, 1)} h`],
    // every board this pill moves, or the busiest one when it moves none
    ...BOARDS.filter((b) => b === worst || Math.abs(fix.maxBoardPct[b] - base.maxBoardPct[b]) >= 1)
      .map((b): [string, string, string] => [`Peak load, ${BOARD_NAMES[b]}`, `${Math.round(base.maxBoardPct[b])}% of rating`, `${Math.round(fix.maxBoardPct[b])}% of rating`]),
  ];
  const col = [W - 250, 125, 125];
  d.ensure(24 + rows.length * 18 + 40);
  let top = d.y;
  d.page.drawRectangle({ x: M, y: top - 18, width: W, height: 18, color: C.navy });
  ['Measure', 'Today', 'With this pill'].forEach((h, i) => d.page.drawText(h, { x: M + 6 + col.slice(0, i).reduce((a, b) => a + b, 0), y: top - 12.5, size: 8.5, font: d.bold, color: C.white }));
  top -= 18;
  rows.forEach((r, ri) => {
    if (ri % 2) d.page.drawRectangle({ x: M, y: top - 18, width: W, height: 18, color: C.panel });
    r.forEach((c, i) => d.page.drawText(d.clean(c), { x: M + 6 + col.slice(0, i).reduce((a, b) => a + b, 0), y: top - 12.5, size: 8.5, font: i === 2 ? d.bold : d.font, color: C.ink }));
    top -= 18;
  });
  d.page.drawLine({ start: { x: M, y: top }, end: { x: M + W, y: top }, thickness: 0.6, color: C.rule });
  d.y = top - 10;
  d.para(`Reviewers: ${ev.verdicts.map((v) => `${v.agent} — ${v.verdict.toUpperCase()}`).join('  ·  ')}`, { size: 8.5, bold: true });
  const over = BOARDS.filter((b) => fix.maxBoardPct[b] > 100);
  const already = over.filter((b) => base.maxBoardPct[b] > 100).length === over.length;
  if (over.length) d.para(`On Tower A ${over.map((b) => BOARD_NAMES[b]).join(', ')} ${already ? 'is already over its rating today and this pill alone does not clear it' : 'ends up over its rating with this pill alone'}, so on its own it would be escalated to the Head of Technical Services. Combine it with the other measures in the library.`, { size: 8.5, color: C.red, bold: true });
}

function beforeYouStart(d: Doc, pill: Pill, titleOf: (id: string) => string) {
  if (!pill.checks?.length) return;
  const lines = pill.checks.map((id) => `Run ${id} first: ${titleOf(id)}.`);
  const h = lines.reduce((a, l) => a + d.wrap(l, 9, W - 24).length * 12.6, 0) + 30;
  d.ensure(h + 16);
  d.y -= 10;
  const top = d.y;
  d.page.drawRectangle({ x: M, y: top - h, width: W, height: h, color: rgb(1, 0.97, 0.9), borderColor: C.amber, borderWidth: 1 });
  d.page.drawText('BEFORE YOU START · REQUIRED CHECK', { x: M + 10, y: top - 16, size: 8.5, font: d.bold, color: C.amber });
  let y = top - 24;
  lines.forEach((l) => { y -= d.text(l, M + 12, y, { size: 9, width: W - 24 }); });
  d.y = top - h - 4;
}

// ---------- checklist pages ----------

function checklist(d: Doc, pill: Pill) {
  // A pill with no chart has nothing to keep on its own summary page, so the checklist follows straight on.
  if (pillEvidence(pill)) d.newPage();
  else { d.ensure(120); d.y -= 14; }
  d.ensure(80);
  d.page.drawText('FIELD CHECKLIST', { x: M, y: d.y - 10, size: 8.5, font: d.bold, color: C.mute });
  d.page.drawText(d.clean(`${pill.id} · ${pill.title}`), { x: M, y: d.y - 26, size: 14, font: d.bold, color: C.navy });
  d.y -= 36;

  d.heading('Steps', 70);
  const stepW = W - 175;
  pill.steps.forEach((s, i) => {
    const hText = d.wrap(s, 9.5, stepW).length * 13.3;
    const h = Math.max(hText, 22) + 8;
    d.ensure(h);
    const top = d.y;
    d.page.drawRectangle({ x: M, y: top - 14, width: 11, height: 11, borderColor: C.ink, borderWidth: 1 });
    d.page.drawText(`${i + 1}.`, { x: M + 18, y: top - 12, size: 9.5, font: d.bold, color: C.navy });
    d.text(s, M + 36, top - 1, { size: 9.5, width: stepW });
    d.page.drawText('Done by', { x: PAGE_W - M - 130, y: top - 12, size: 7, font: d.font, color: C.mute });
    d.page.drawLine({ start: { x: PAGE_W - M - 100, y: top - 13 }, end: { x: PAGE_W - M - 50, y: top - 13 }, thickness: 0.5, color: C.mute });
    d.page.drawText('Time', { x: PAGE_W - M - 44, y: top - 12, size: 7, font: d.font, color: C.mute });
    d.page.drawLine({ start: { x: PAGE_W - M - 22, y: top - 13 }, end: { x: PAGE_W - M, y: top - 13 }, thickness: 0.5, color: C.mute });
    d.y = top - h;
  });

  if (pill.guardrails.length) {
    const lines = pill.guardrails.map((g) => `•  ${g}`);
    const h = lines.reduce((a, l) => a + d.wrap(l, 9.5, W - 28).length * 13.3, 0) + 34;
    d.ensure(h + 14);
    d.y -= 12;
    const top = d.y;
    d.page.drawRectangle({ x: M, y: top - h, width: W, height: h, color: C.redWash, borderColor: C.red, borderWidth: 1.2 });
    d.page.drawText('STOP IF…  GUARDRAILS', { x: M + 10, y: top - 17, size: 9, font: d.bold, color: C.red });
    let y = top - 24;
    lines.forEach((l) => { y -= d.text(l, M + 12, y, { size: 9.5, width: W - 28 }); });
    d.y = top - h - 2;
  }

  d.heading('Tools', 30);
  d.para(pill.tools.join(', ') || '—');

  if (pill.composedOf?.length) { d.heading('Built from the library', 30); d.para(pill.composedOf.join(', ')); }

  if (pill.knowHow?.length) {
    d.heading('Captured know-how', 60);
    pill.knowHow.forEach((k) => {
      d.para(`Q: ${k.question}`, { bold: true, size: 9 });
      d.para(k.answer, { size: 9, x: M + 14, width: W - 14 });
      d.y -= 4;
    });
  }
}

function history(d: Doc, pill: Pill) {
  d.heading('Revisions', 60);
  [...pill.revisions].reverse().forEach((r) => d.para(`Rev ${r.rev} · ${r.date} · ${r.by}: ${r.note}`, { size: 9 }));
  if (pill.ratings.length) {
    d.heading('Health ratings', 50);
    [...pill.ratings].reverse().forEach((r) => {
      d.ensure(16);
      d.stars(M, d.y - 10, r.rating, 9);
      d.y -= d.text(`${r.rating}/5 · ${r.at} · ${r.by}: ${r.reason}`, M + 62, d.y, { size: 9, width: W - 62 }) + 2;
    });
  }
  d.heading('Execution sign-off (printed copies)', 70);
  d.ensure(60);
  const top = d.y - 6;
  [['Executed by', M], ['Date', M + 200], ['Signature', M + 300]].forEach(([label, x]) => {
    d.page.drawText(String(label), { x: x as number, y: top - 6, size: 8, font: d.font, color: C.mute });
    d.page.drawLine({ start: { x: x as number, y: top - 30 }, end: { x: (x as number) + (label === 'Executed by' ? 180 : label === 'Date' ? 85 : PAGE_W - M - 300 - M), y: top - 30 }, thickness: 0.6, color: C.ink });
  });
  d.y = top - 40;
}

function footers(d: Doc, pill: Pill, now: Date) {
  const pages = d.pdf.getPages();
  const url = pillUrl(pill.id);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: PAGE_W - M, y: 44 }, thickness: 0.5, color: C.rule });
    p.drawText(d.clean(`${pill.id} · Revision ${currentRev(pill)} · SYNTHETIC DATA`), { x: M, y: 32, size: 7.5, font: d.bold, color: C.red });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: PAGE_W - M - d.font.widthOfTextAtSize(pg, 7.5), y: 32, size: 7.5, font: d.font, color: C.mute });
    p.drawText(d.clean(`Printed ${now.toISOString().slice(0, 10)}. Printed copies go out of date: check the live pill for the current revision. ${url}`.slice(0, 150)),
      { x: M, y: 21, size: 6.8, font: d.font, color: C.mute });
  });
}

export async function generatePillPdf(pill: Pill, titleOf: (id: string) => string = (id) => id): Promise<Uint8Array> {
  const d = await Doc.create();
  const now = new Date();
  header(d, pill);
  glance(d, pill);
  evidence(d, pill);
  beforeYouStart(d, pill, titleOf);
  checklist(d, pill);
  history(d, pill);
  footers(d, pill, now);
  d.pdf.setTitle(`${pill.id} ${pill.title}`);
  d.pdf.setLanguage('en-SG');
  d.pdf.setAuthor(pill.owner.name);
  d.pdf.setSubject('Intelligence Pill (synthetic data)');
  d.pdf.catalog.set(PDFName.of('IPLayout'), PDFName.of(PDF_LAYOUT_MARK));
  d.pdf.setProducer('Intelligence Pills');
  return d.pdf.save({ useObjectStreams: false });
}
