// Pill PDF, laid out as a controlled document: a control page (document control, approval, revision history, contents),
// numbered sections from Purpose to Records, and appendices for know-how and the execution record.
// pdf-lib draws it with Liberation Sans embedded (Arial metrics); glyphs the font lacks (CJK, emoji) print as "?".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Pill } from '../shared/flow.ts';
import { currentRev, ESCALATION_ROLE, health, systemName, USERS } from '../shared/flow.ts';
import {
  baseline, BOARD_NAMES, BOARDS, currentValue, describeValue, fmtKw, fmtTime, measureById, reviewAgents, settingsFor, simulateMeasures,
  TERMS, TOWER, TUNING_FIELDS, TUNING_IDS,
  type AgentComment, type Board, type MeasureId, type SimResult,
} from '../shared/model.ts';

/** Written into every PDF's catalog, so stored PDFs made by an older layout are regenerated. */
export const PDF_LAYOUT_MARK = 'ip-layout-3';
// A PDF name is stored as plain text, unlike keywords, which pdf-lib hex-encodes.
export const hasCurrentLayout = (pdf: Uint8Array) => Buffer.from(pdf).includes(`/${PDF_LAYOUT_MARK}`);

const ASSETS = join(import.meta.dirname, 'assets');
const FONT_BYTES = { regular: readFileSync(join(ASSETS, 'LiberationSans-Regular.ttf')), bold: readFileSync(join(ASSETS, 'LiberationSans-Bold.ttf')) };

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const M = 42;
const W = PAGE_W - M * 2;
const TOP = PAGE_H - 30; // top of the page header box
const HEADER_H = 50;
const CLASS_H = 13; // classification strip under the header
const Y0 = TOP - HEADER_H - CLASS_H - 16; // where page content starts
const BOTTOM = 60; // content stops here; the footer sits below

type Color = ReturnType<typeof rgb>;
const C = {
  ink: rgb(0.1, 0.11, 0.13), mute: rgb(0.36, 0.39, 0.43), navy: rgb(0.05, 0.21, 0.34), grid: rgb(0.6, 0.63, 0.67),
  head: rgb(0.89, 0.91, 0.94), key: rgb(0.955, 0.96, 0.968), red: rgb(0.72, 0.1, 0.18), redWash: rgb(0.99, 0.95, 0.95),
  blue: rgb(0.1, 0.36, 0.78), rule: rgb(0.8, 0.83, 0.86),
};

// ---------- what the simulator says about this pill ----------

/** The measures to re-simulate for a pill, or none when the Tower A simulator does not model it. */
export function simulatedMeasures(pill: Pill): MeasureId[] {
  if (pill.measures?.length) return pill.measures;
  return pill.measureId ? [pill.measureId] : [];
}

export interface PillEvidence { base: SimResult; fix: SimResult; reviews: AgentComment[] }
/** Re-simulated, never stored: the numbers in the PDF come from the same model the app uses. */
export function pillEvidence(pill: Pill): PillEvidence | null {
  const measures = simulatedMeasures(pill);
  if (!measures.length) return null;
  const base = baseline();
  const fix = simulateMeasures(measures, settingsFor(pill.tuning));
  return { base, fix, reviews: reviewAgents(base, fix).comments };
}

/** Pills that must be completed first: the ones stored at approval, or library checks that guard this pill's systems. */
export function requiredChecks(pill: Pill, library: Pill[]): string[] {
  return pill.checks ?? library.filter((p) => p.id !== pill.id && !p.caseId && p.checkFor?.some((t) => pill.tags.includes(t))).map((p) => p.id);
}

// ---------- drawing ----------

type Cell = string | { t: string; bold?: boolean; color?: Color };
const cellText = (c: Cell) => (typeof c === 'string' ? c : c.t);
/** Column widths that fill the page: a 0 takes an equal share of what the fixed widths leave. */
const fit = (...ws: number[]) => {
  const rest = (W - ws.reduce((a, b) => a + b, 0)) / Math.max(1, ws.filter((w) => !w).length);
  return ws.map((w) => w || rest);
};

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

  get pageNo() { return this.pdf.getPageCount(); }
  newPage() { this.page = this.pdf.addPage([PAGE_W, PAGE_H]); this.y = Y0; }
  /** Start a new page unless `h` points still fit above the footer. */
  ensure(h: number) { if (this.y - h < BOTTOM) this.newPage(); }

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

  /** A paragraph at the cursor, broken across pages line by line. */
  para(t: string, o: { size?: number; bold?: boolean; color?: Color; x?: number; width?: number; after?: number } = {}) {
    const size = o.size ?? 9.5;
    const lead = size * 1.4;
    const font = o.bold ? this.bold : this.font;
    for (const ln of this.wrap(t, size, o.width ?? W - ((o.x ?? M) - M), font)) {
      this.ensure(lead);
      this.page.drawText(ln, { x: o.x ?? M, y: this.y - size, size, font, color: o.color ?? C.ink });
      this.y -= lead;
    }
    this.y -= o.after ?? 4;
  }

  bullets(items: string[]) {
    for (const it of items) {
      this.ensure(14);
      this.page.drawText('•', { x: M + 4, y: this.y - 9.5, size: 9.5, font: this.font, color: C.ink });
      this.para(it, { x: M + 16, after: 1 });
    }
    this.y -= 4;
  }

  /** An unnumbered label above a table or a run of text. `keep` is the room its content needs with it. */
  label(t: string, keep = 40) {
    this.ensure(16 + keep);
    this.page.drawText(this.clean(t), { x: M, y: this.y - 9, size: 9, font: this.bold, color: C.navy });
    this.y -= 15;
  }

  /** A bordered table that repeats its heading row when it runs onto a new page. */
  table(widths: number[], rows: Cell[][], o: { head?: string[]; keyCols?: number[]; size?: number; minRow?: number } = {}) {
    const size = o.size ?? 8.5, lh = size * 1.32, pad = 5;
    const xs = widths.reduce<number[]>((a, w) => [...a, a.at(-1)! + w], [M]);
    const drawRow = (cells: Cell[], head: boolean) => {
      const isBold = (c: Cell, i: number) => head || !!o.keyCols?.includes(i) || (typeof c !== 'string' && !!c.bold);
      // shortcut: a cell is cut at 50 lines, upgrade to row splitting if pills ever carry page-long cells
      const lines = cells.map((c, i) => this.wrap(cellText(c), size, widths[i] - pad * 2, isBold(c, i) ? this.bold : this.font).slice(0, 50));
      const h = Math.max(head ? 0 : o.minRow ?? 0, Math.max(...lines.map((l) => l.length)) * lh + pad * 2 - 1);
      if (this.y - h < BOTTOM) { this.newPage(); if (!head && o.head) drawRow(o.head, true); }
      const top = this.y;
      cells.forEach((c, i) => {
        const fill = head ? C.head : o.keyCols?.includes(i) ? C.key : undefined;
        this.page.drawRectangle({ x: xs[i], y: top - h, width: widths[i], height: h, color: fill, borderColor: C.grid, borderWidth: 0.5 });
        const color = typeof c !== 'string' && c.color ? c.color : head ? C.navy : C.ink;
        lines[i].forEach((ln, n) => this.page.drawText(ln, { x: xs[i] + pad, y: top - pad - size + 1 - n * lh, size, font: isBold(c, i) ? this.bold : this.font, color }));
      });
      this.y = top - h;
    };
    if (o.head) { this.ensure(44); drawRow(o.head, true); }
    rows.forEach((r) => drawRow(r, false));
    this.y -= 9;
  }
}

const stat = (n: number, dp = 0) => n.toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pillUrl = (id: string) => `${process.env.APP_URL?.trim().replace(/\/$/, '') ?? ''}/pills/${id}`;
const DOC_TYPE = 'Standard operating procedure';
const BOARD_TERM: Record<Board, string> = { msb: 'MSB', sb1: 'SB-1', sb2: 'SB-2', sb3: 'SB-3', sb4: 'SB-4' };

/** Whole-building demand over the working day: today against with-this-procedure, with the contracted cap. */
function chart(d: Doc, ev: PillEvidence) {
  const H = 150, left = 40, right = 18, bottom = 20, top = 8;
  d.ensure(H + 26);
  const x0 = M + left, x1 = M + W - right, y0 = d.y - H + bottom, y1 = d.y - top;
  const [h0, h1] = [5, 20];
  const yMax = Math.ceil((Math.max(ev.base.peakKw, ev.fix.peakKw, TOWER.contractedCapacityKw) * 1.05) / 500) * 500;
  const X = (h: number) => x0 + ((h - h0) / (h1 - h0)) * (x1 - x0);
  const Y = (kw: number) => y0 + (kw / yMax) * (y1 - y0);
  const p = d.page;
  p.drawRectangle({ x: M, y: d.y - H, width: W, height: H, borderColor: C.grid, borderWidth: 0.5 });
  for (let kw = 0; kw <= yMax; kw += 1000) {
    p.drawLine({ start: { x: x0, y: Y(kw) }, end: { x: x1, y: Y(kw) }, thickness: 0.4, color: C.rule });
    p.drawText(stat(kw), { x: M + 6, y: Y(kw) - 2.5, size: 7, font: d.font, color: C.mute });
  }
  for (let h = h0; h <= h1; h += 3) p.drawText(fmtTime(h), { x: X(h) - 9, y: y0 - 11, size: 7, font: d.font, color: C.mute });
  p.drawText('kW', { x: M + 6, y: y1 - 1, size: 7, font: d.bold, color: C.mute });
  const line = (r: SimResult, color: Color, thickness: number) => {
    const pts = r.series.filter((s) => s.t >= h0 && s.t <= h1);
    for (let i = 1; i < pts.length; i++) p.drawLine({ start: { x: X(pts[i - 1].t), y: Y(pts[i - 1].msb) }, end: { x: X(pts[i].t), y: Y(pts[i].msb) }, thickness, color });
  };
  line(ev.base, C.mute, 1.1);
  line(ev.fix, C.blue, 1.7);
  const cap = TOWER.contractedCapacityKw;
  p.drawLine({ start: { x: x0, y: Y(cap) }, end: { x: x1, y: Y(cap) }, thickness: 0.9, color: C.red, dashArray: [4, 3] });
  d.y -= H + 5;
  // the legend names each line, so colour is never the only signal
  const leg = (x: number, color: Color, text: string, dash = false) => {
    p.drawLine({ start: { x, y: d.y - 4 }, end: { x: x + 16, y: d.y - 4 }, thickness: 1.5, color, dashArray: dash ? [4, 3] : undefined });
    p.drawText(text, { x: x + 20, y: d.y - 6.5, size: 7.5, font: d.font, color: C.ink });
  };
  leg(M, C.mute, `Today, peak ${fmtKw(ev.base.peakKw)}`);
  leg(M + 150, C.blue, `With this procedure, peak ${fmtKw(ev.fix.peakKw)}`);
  leg(M + 345, C.red, `Contracted capacity ${fmtKw(cap)}`, true);
  d.y -= 16;
}

// ---------- the document ----------

interface Section { key: string; title: string; appendix?: boolean; draw: () => void }

export async function generatePillPdf(pill: Pill, library: Pill[] = []): Promise<Uint8Array> {
  const d = await Doc.create();
  const today = new Date().toISOString().slice(0, 10);
  const rev = currentRev(pill);
  const latest = pill.revisions.at(-1);
  const approvalOf = (r: number) => pill.approvals?.find((a) => a.rev === r);
  const titleOf = (id: string) => library.find((p) => p.id === id)?.title ?? '';
  const ev = pillEvidence(pill);
  const measures = simulatedMeasures(pill);
  const checks = requiredChecks(pill, library);
  const rated = health(pill);
  const manager = USERS.find((u) => u.role === 'manager')!;

  // Sections are listed before they are drawn, so text can cite "section 8" and the contents list knows its length.
  const sections: Section[] = [];
  const ref = (key: string) => {
    const i = sections.findIndex((s) => s.key === key);
    if (i < 0) return '';
    const s = sections[i];
    return s.appendix ? `Appendix ${String.fromCharCode(65 + sections.slice(0, i).filter((x) => x.appendix).length)}` : `section ${sections.slice(0, i).filter((x) => !x.appendix).length + 1}`;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  sections.push({ key: 'purpose', title: 'Purpose', draw: () => {
    d.para(pill.summary);
    if (pill.problem?.trim()) {
      d.label(`Problem addressed, as described by the engineer${pill.caseId ? ` on ${pill.caseId}` : ''}`, 20);
      d.para(pill.problem.trim(), { color: C.mute });
    }
  } });

  sections.push({ key: 'scope', title: 'Scope and applicability', draw: () => {
    d.table(fit(110, 0), [
      ['System', pill.system],
      ['Domain', pill.domain],
      ['Applies to', pill.tags.map(systemName).join('; ') || 'Not tagged'],
      ['In use at', pill.sites.join(', ') || 'Approved, not yet in use at any site'],
      ['Evidence', ev
        ? `${cap(ref('evidence'))} is a simulation of Tower A only (synthetic ${TOWER.floors}-floor office tower, ${fmtKw(TOWER.contractedCapacityKw)} contracted capacity). It does not describe any other site.`
        : 'Not simulated: the Tower A simulator does not model this procedure.'],
    ], { keyCols: [0] });
  } });

  sections.push({ key: 'definitions', title: 'Definitions and abbreviations', draw: () => {
    const text = [pill.summary, pill.problem ?? '', ...pill.steps, ...pill.guardrails, ...(pill.knowHow ?? []).flatMap((k) => [k.question, k.answer])].join(' ');
    const has = (w: string) => new RegExp(`\\b${w}\\b`).test(text);
    const moved = ev ? BOARDS.filter((b) => Math.abs(ev.fix.maxBoardPct[b] - ev.base.maxBoardPct[b]) >= 1 || ev.fix.maxBoardPct[b] > 90) : [];
    const rows: Cell[][] = [
      ['Intelligence Pill (pill)', 'A reusable, manager-approved procedure that captures an engineer’s know-how for a recurring site problem.'],
      ['Health', 'The manager’s latest rating of the pill in use, from 1 to 5, always given with a reason.'],
      ['Guardrail', 'A limit that must hold while the procedure runs.'],
      ['Approved / Live', 'Approved: released by the manager. Live: carried out at one or more sites.'],
      ...(checks.length ? [['Required check', 'Another pill that must be completed before this procedure is carried out.']] : []),
      ...BOARDS.filter((b) => has(BOARD_TERM[b]) || moved.includes(b)).map((b) => [BOARD_TERM[b], `Tower A: ${TERMS[BOARD_TERM[b]]}`]),
      ...(has('AHU') || has('AHUs') ? [['AHU', TERMS.AHU]] : []),
      ...(has('inrush') || /surge/i.test(text) ? [['Inrush (start-up surge)', TERMS.inrush]] : []),
      ...(ev ? [['Contracted capacity (the cap)', `Tower A: ${TERMS['the cap']}`]] : []),
    ];
    d.table(fit(140, 0), rows, { head: ['Term', 'Meaning'], keyCols: [0] });
  } });

  sections.push({ key: 'roles', title: 'Roles and responsibilities', draw: () => {
    d.table(fit(170, 0), [
      [`Document owner: ${pill.owner.name}, ${pill.owner.title}, ${pill.owner.site}`, 'Author of this procedure and the contact for questions about it.'],
      ['Engineer carrying out the work', `Completes the prerequisites (${ref('prerequisites')}), keeps to the guardrails (${ref('guardrails')}), follows the procedure in order (${ref('procedure')}) and fills in the execution record (${ref('record')}).`],
      [manager.title, 'Approves each revision before it is used, authorises it to be carried out at a site, and rates the pill’s health with a reason.'],
      [ESCALATION_ROLE, 'Decides any proposal that puts a power board above 100% of its rating. Such a proposal cannot be approved at manager level.'],
      ['Review agents: Energy, Tenant Experience, Technical Services', 'Automated reviewers. Each checks a proposal against the simulation and gives support, concern or block.'],
    ], { head: ['Role', 'Responsibility'], keyCols: [0] });
  } });

  sections.push({ key: 'related', title: 'Related documents', draw: () => {
    const listed = new Set([pill.id, ...checks, ...(pill.composedOf ?? [])]);
    const rows: Cell[][] = [
      ...checks.map((id) => [id, titleOf(id), 'Required check: complete before this procedure.']),
      ...(pill.composedOf ?? []).map((id) => [id, titleOf(id), 'Source pill: this procedure is built from it.']),
      ...(pill.caseId ? [[pill.caseId, 'Originating case', 'Where the problem, the simulation and the approval are recorded.']] : []),
      ...library.filter((p) => !listed.has(p.id) && p.tags.some((t) => pill.tags.includes(t))).map((p) => [p.id, p.title, 'Related: works on the same system.']),
      ...(ev ? [['Tower A demand model', 'Weekday simulation in Intelligence Pills, 96 steps of 15 minutes', `Source of the figures in ${ref('evidence')}.`]] : []),
    ];
    if (rows.length) d.table(fit(105, 190, 0), rows, { head: ['Reference', 'Title', 'Relationship'], keyCols: [0] });
    else d.para('None.');
  } });

  sections.push({ key: 'evidence', title: 'Simulated effect on Tower A', draw: () => {
    if (!ev) {
      d.para('Not applicable. The Tower A simulator does not model this procedure, so no simulated figures are given. Its value is the prerequisites, guardrails and procedure that follow.');
      return;
    }
    const { base, fix } = ev;
    d.para(pill.caseId
      ? `Simulation of Tower A’s weekday demand with this procedure’s ${measures.length} measure${measures.length === 1 ? '' : 's'} applied, compared with today’s schedule, using the settings revision ${rev} was approved with (${ref('settings')}). The figures are re-simulated from the Tower A model each time this document is generated. They are not measurements.`
      : `Simulation of Tower A’s weekday demand with only this procedure applied, compared with today’s schedule. ${pill.sites.length ? `The sites where it is in use (${pill.sites.join(', ')}) are not modelled. ` : ''}The figures are re-simulated from the Tower A model each time this document is generated. They are not measurements.`);
    chart(d, ev);
    const dPeak = fix.peakKw - base.peakKw;
    d.para(`Figure 1. Whole-building demand, 05:00 to 20:00 on a weekday. Peak ${fmtKw(base.peakKw)} today and ${fmtKw(fix.peakKw)} with this procedure (${Math.abs(dPeak) < 0.5 ? 'unchanged' : `${dPeak < 0 ? 'down' : 'up'} ${fmtKw(Math.abs(dPeak))}`}), against a contracted capacity of ${fmtKw(TOWER.contractedCapacityKw)}.`, { size: 8, color: C.mute, after: 8 });
    const worst = BOARDS.reduce((a, b) => (fix.maxBoardPct[b] > fix.maxBoardPct[a] ? b : a));
    d.label('Table 1. Simulated figures', 60);
    d.table(fit(0, 130, 130), [
      ['Peak demand', `${fmtKw(base.peakKw)} at ${fmtTime(base.peakAtHour)}`, `${fmtKw(fix.peakKw)} at ${fmtTime(fix.peakAtHour)}`],
      ['Energy per day', `${stat(base.totalKwh)} kWh`, `${stat(fix.totalKwh)} kWh`],
      ['Energy cost per day (synthetic tariff)', `$${stat(base.costUsd, 2)}`, `$${stat(fix.costUsd, 2)}`],
      ['Hours when floors may be too warm', `${stat(base.comfortHoursAtRisk, 1)} h`, `${stat(fix.comfortHoursAtRisk, 1)} h`],
      // every board this procedure moves, and always the busiest one
      ...BOARDS.filter((b) => b === worst || Math.abs(fix.maxBoardPct[b] - base.maxBoardPct[b]) >= 1)
        .map((b) => [`Peak load, ${BOARD_NAMES[b]}`, `${Math.round(base.maxBoardPct[b])}% of rating`, `${Math.round(fix.maxBoardPct[b])}% of rating`]),
    ], { head: ['Measure', 'Today', 'With this procedure'], keyCols: [0] });
    d.label('Table 2. Automated review of the simulation', 60);
    d.table(fit(110, 62, 0), ev.reviews.map((r) => [r.agent, { t: cap(r.verdict), bold: true, color: r.verdict === 'block' ? C.red : C.ink }, r.points.join('\n')]),
      { head: ['Reviewer', 'Verdict', 'Findings'], keyCols: [0] });
    const over = BOARDS.filter((b) => fix.maxBoardPct[b] > 100);
    if (over.length) {
      const already = over.every((b) => base.maxBoardPct[b] > 100);
      d.para(`Note: at Tower A, ${over.map((b) => BOARD_NAMES[b]).join(', ')} ${already ? 'is already above its rating today and this procedure alone does not clear it' : 'ends up above its rating with this procedure alone'}. Applied on its own at Tower A it would go to the ${ESCALATION_ROLE}, so it is combined there with other pills in the library.`, { size: 8.5, color: C.red });
    }
  } });

  sections.push({ key: 'prerequisites', title: 'Prerequisites', draw: () => {
    d.label('Authorisation', 30);
    d.para(`This revision must show as Approved or Live in Intelligence Pills. A printed copy is uncontrolled: confirm that revision ${rev} is still the current one on the live pill before starting.`);
    d.label('Required checks', 20);
    if (checks.length) d.bullets(checks.map((id) => `${id}${titleOf(id) ? `, ${titleOf(id)}` : ''}: complete it before starting this procedure.`));
    else d.para('None.');
    d.label('Tools and equipment', 20);
    if (pill.tools.length) d.bullets(pill.tools);
    else d.para('None listed.');
  } });

  sections.push({ key: 'guardrails', title: 'Guardrails', draw: () => {
    if (!pill.guardrails.length) { d.para('None listed.'); return; }
    d.para('These limits must hold for the whole procedure.');
    d.table(fit(34, 0), pill.guardrails.map((g, i) => [`G${i + 1}`, g]), { head: ['No.', 'Guardrail'], keyCols: [0] });
  } });

  const fields = TUNING_IDS.filter((f) => measures.includes(TUNING_FIELDS[f].measure));
  if (fields.length) sections.push({ key: 'settings', title: 'Settings', draw: () => {
    const s = settingsFor(pill.tuning);
    const tuned = fields.some((f) => pill.tuning?.[f] !== undefined);
    d.para(`The values revision ${rev} was simulated with.${tuned ? ' A value marked "set by the engineer" was changed from the library default on the originating case.' : ''}`);
    d.table(fit(0, 105, 110, 150), fields.map((f) => [
      TUNING_FIELDS[f].label,
      { t: describeValue(f, currentValue(f, s)) + (pill.tuning?.[f] !== undefined ? '\n(set by the engineer)' : ''), bold: true },
      `${describeValue(f, TUNING_FIELDS[f].min)} to ${describeValue(f, TUNING_FIELDS[f].max)}`,
      measureById(TUNING_FIELDS[f].measure)?.title ?? '',
    ]), { head: ['Setting', 'Value', 'Permitted range', 'Belongs to'], keyCols: [0] });
  } });

  sections.push({ key: 'procedure', title: 'Procedure', draw: () => {
    d.para('Carry out the steps in order. Initial and time each step on the printed copy as it is completed.');
    d.table(fit(34, 0, 58, 58), pill.steps.map((s, i) => [`${i + 1}`, s, '', '']), { head: ['Step', 'Action', 'Initials', 'Time'], keyCols: [0], size: 9, minRow: 26 });
  } });

  sections.push({ key: 'monitoring', title: 'Monitoring and review', draw: () => {
    d.para('Health is the manager’s latest rating of this pill in use, from 1 to 5. A change to the procedure is issued as a new revision and needs the manager’s approval again.');
    if (!pill.ratings.length) { d.para('Not yet rated.'); return; }
    d.table(fit(62, 50, 105, 0), [...pill.ratings].reverse().map((r) => [r.at, `${r.rating} of 5`, r.by, r.reason]), { head: ['Date', 'Health', 'Rated by', 'Reason'] });
  } });

  sections.push({ key: 'records', title: 'Records', draw: () => {
    d.table(fit(190, 0), [
      ['Execution record', `${ref('record')} of this document, completed on the printed copy.`],
      ['Approvals, returns, executions and health ratings', 'The Intelligence Pills audit log, which can only be added to.'],
      ['This document', 'Regenerated by Intelligence Pills whenever a revision is approved or the health is re-rated. The live pill is the controlled version.'],
    ], { head: ['Record', 'Where it is kept'], keyCols: [0] });
  } });

  if (pill.knowHow?.length) sections.push({ key: 'knowhow', title: 'Captured know-how', appendix: true, draw: () => {
    d.para('What the engineer told the agent while this pill was drafted, in the engineer’s own words.');
    d.table(fit(200, 0), pill.knowHow!.map((k) => [k.question, k.answer]), { head: ['Question', 'Engineer’s answer'], keyCols: [0] });
  } });

  sections.push({ key: 'record', title: 'Execution record', appendix: true, draw: () => {
    d.para(`Complete on the printed copy each time ${pill.id} is carried out.`);
    d.table(fit(100, 0, 100, 0), [
      ['Site', '', 'Date', ''],
      ['Revision used', '', 'Start and finish time', ''],
      ['Carried out by (name)', '', 'Signature', ''],
      ['Verified by (name)', '', 'Signature', ''],
    ], { keyCols: [0, 2], minRow: 28 });
    d.y += 9; // join the notes row to the form above
    d.table(fit(100, 0), [['Deviations and notes', '']], { keyCols: [0], minRow: 84 });
  } });

  // ----- control page -----
  d.page.drawText(DOC_TYPE.toUpperCase(), { x: M, y: d.y - 8, size: 8.5, font: d.bold, color: C.mute });
  d.y -= 16;
  for (const ln of d.wrap(pill.title, 19, W, d.bold).slice(0, 3)) { d.page.drawText(ln, { x: M, y: d.y - 19, size: 19, font: d.bold, color: C.navy }); d.y -= 24; }
  d.y -= 2;
  d.para(pill.summary, { size: 10, color: C.mute, after: 10 });

  d.label('DOCUMENT CONTROL');
  d.table(fit(92, 0, 92, 0), [
    ['Document no.', pill.id, 'Revision', `${rev}`],
    ['Document type', `${DOC_TYPE} (Intelligence Pill)`, 'Status', pill.status === 'live' ? 'LIVE: in use at a site' : 'APPROVED: released, not yet carried out'],
    ['Effective date', latest?.date ?? 'Not recorded', 'Health', rated === null ? 'Not yet rated' : `${rated} of 5 (manager’s latest rating)`],
    ['Document owner', `${pill.owner.name}, ${pill.owner.title}, ${pill.owner.site}`, 'Domain', pill.domain],
    ['System', pill.system, 'In use at', pill.sites.join(', ') || 'Not yet in use'],
    ['Classification', 'Synthetic demonstration data', 'Originating case', pill.caseId ?? 'Not recorded'],
  ], { keyCols: [0, 2] });

  d.label('APPROVAL');
  const approval = approvalOf(rev);
  d.table(fit(68, 112, 118, 58, 0), [
    ['Prepared by', latest?.by ?? pill.owner.name, (latest?.by ?? pill.owner.name) === pill.owner.name ? pill.owner.title : '', latest?.date ?? '', `Issued revision ${rev}.`],
    // Only a pill made from a case has a review on record: the agents reviewed that case's proposal before approval.
    ...(pill.caseId && ev ? [['Reviewed by', 'Energy, Tenant Experience and Technical Services review agents', 'Automated review', approval?.at ?? latest?.date ?? '',
      `${ev.reviews.map((r) => `${r.agent}: ${r.verdict}`).join('. ')}. See ${ref('evidence')}.`]] : []),
    approval
      ? ['Approved by', approval.by, approval.title, approval.at, `Approved electronically in Intelligence Pills.${approval.reason ? ` Reason: ${approval.reason}` : ''}`]
      : ['Approved by', 'Not recorded on this pill', '', '', 'This pill was stored before approval records were kept on the pill.'],
  ], { head: ['', 'Name', 'Title', 'Date', 'Record'], keyCols: [0] });

  d.label('REVISION HISTORY');
  d.table(fit(32, 62, 105, 0, 105), [...pill.revisions].reverse().map((r) => [`${r.rev}`, r.date, r.by, r.note, approvalOf(r.rev)?.by ?? 'Not recorded']),
    { head: ['Rev', 'Date', 'Author', 'Description of change', 'Approved by'], keyCols: [0] });

  const tocRows = Math.ceil(sections.length / 2);
  d.label('CONTENTS', tocRows * 12);
  const toc = { page: d.page, top: d.y };
  d.y -= tocRows * 12 + 12;

  d.ensure(44);
  d.page.drawRectangle({ x: M, y: d.y - 36, width: W, height: 36, color: C.key, borderColor: C.grid, borderWidth: 0.5 });
  d.page.drawText('Uncontrolled when printed.', { x: M + 8, y: d.y - 14, size: 8.5, font: d.bold, color: C.ink });
  d.wrap(`The controlled version of this document is the live pill in Intelligence Pills (${pillUrl(pill.id)}). Check the revision number there before use.`, 8, W - 16)
    .slice(0, 2).forEach((ln, i) => d.page.drawText(ln, { x: M + 8, y: d.y - 25 - i * 10, size: 8, font: d.font, color: C.mute }));
  d.y -= 44;

  // ----- body -----
  d.newPage();
  const pages: number[] = [];
  sections.forEach((s) => {
    const name = cap(ref(s.key));
    d.ensure(s.key === 'record' ? 260 : 90); // the form stays on one page; a heading never sits alone at the foot
    pages.push(d.pageNo);
    d.y -= 6;
    d.page.drawText(d.clean(s.appendix ? `${name}  ${s.title}` : `${name.replace('Section ', '')}   ${s.title}`), { x: M, y: d.y - 11.5, size: 11.5, font: d.bold, color: C.navy });
    d.y -= 17;
    d.page.drawLine({ start: { x: M, y: d.y }, end: { x: PAGE_W - M, y: d.y }, thickness: 0.7, color: C.navy });
    d.y -= 8;
    s.draw();
    d.y -= 4;
  });

  // contents, now that every section knows its page
  sections.forEach((s, i) => {
    const col = i < tocRows ? 0 : 1;
    const x = M + col * (W / 2 + 8), w = W / 2 - 8, y = toc.top - 9 - (col ? i - tocRows : i) * 12;
    const name = cap(ref(s.key)).replace('Section ', '');
    toc.page.drawText(d.clean(`${name}${s.appendix ? ':' : '.'}  ${s.title}`), { x, y, size: 8.5, font: d.font, color: C.ink });
    const pg = `${pages[i]}`;
    toc.page.drawText(pg, { x: x + w - d.font.widthOfTextAtSize(pg, 8.5), y, size: 8.5, font: d.font, color: C.ink });
  });

  // ----- header and footer on every page -----
  const all = d.pdf.getPages();
  const leftW = 128, rightW = 140;
  all.forEach((p, i) => {
    p.drawRectangle({ x: M, y: TOP - HEADER_H, width: W, height: HEADER_H, borderColor: C.grid, borderWidth: 0.8 });
    for (const x of [M + leftW, M + W - rightW]) p.drawLine({ start: { x, y: TOP }, end: { x, y: TOP - HEADER_H }, thickness: 0.8, color: C.grid });
    p.drawText('INTELLIGENCE PILLS', { x: M + 8, y: TOP - 19, size: 9.5, font: d.bold, color: C.navy });
    p.drawText('Pill library', { x: M + 8, y: TOP - 31, size: 7.5, font: d.font, color: C.mute });
    p.drawText(d.wrap(pill.domain, 7.5, leftW - 16)[0], { x: M + 8, y: TOP - 41, size: 7.5, font: d.font, color: C.mute });
    p.drawText(DOC_TYPE.toUpperCase(), { x: M + leftW + 8, y: TOP - 15, size: 7, font: d.bold, color: C.mute });
    d.wrap(pill.title, 10, W - leftW - rightW - 16, d.bold).slice(0, 2).forEach((ln, n) => p.drawText(ln, { x: M + leftW + 8, y: TOP - 29 - n * 12, size: 10, font: d.bold, color: C.ink }));
    const rx = M + W - rightW, rh = HEADER_H / 3;
    ([['Document no.', pill.id], ['Revision', `${rev} · ${pill.status.toUpperCase()}`], ['Page', `${i + 1} of ${all.length}`]] as const).forEach(([k, v], n) => {
      if (n) p.drawLine({ start: { x: rx, y: TOP - n * rh }, end: { x: M + W, y: TOP - n * rh }, thickness: 0.5, color: C.grid });
      p.drawText(k, { x: rx + 6, y: TOP - n * rh - 11, size: 6.5, font: d.font, color: C.mute });
      p.drawText(d.clean(v), { x: rx + 58, y: TOP - n * rh - 11.5, size: 8.5, font: d.bold, color: C.ink });
    });
    // classification on every page: the synthetic marker is never more than a glance away
    p.drawRectangle({ x: M, y: TOP - HEADER_H - CLASS_H, width: W, height: CLASS_H, color: C.redWash, borderColor: C.red, borderWidth: 0.6 });
    const cls = 'CLASSIFICATION: SYNTHETIC DEMONSTRATION DATA · NOT KEPPEL DATA';
    p.drawText(cls, { x: M + (W - d.bold.widthOfTextAtSize(cls, 7)) / 2, y: TOP - HEADER_H - CLASS_H + 3.6, size: 7, font: d.bold, color: C.red });

    p.drawLine({ start: { x: M, y: 46 }, end: { x: PAGE_W - M, y: 46 }, thickness: 0.6, color: C.grid });
    p.drawText(d.clean(`${pill.id} · Revision ${rev} · ${pill.title}`.slice(0, 95)), { x: M, y: 35, size: 7, font: d.font, color: C.mute });
    const printed = `Printed ${today}`;
    p.drawText(printed, { x: PAGE_W - M - d.font.widthOfTextAtSize(printed, 7), y: 35, size: 7, font: d.font, color: C.mute });
    p.drawText(d.wrap(`Uncontrolled when printed. Controlled version: ${pillUrl(pill.id)}`, 7, W)[0], { x: M, y: 25, size: 7, font: d.font, color: C.mute });
  });

  d.pdf.setTitle(`${pill.id} ${pill.title}`);
  d.pdf.setLanguage('en-SG');
  d.pdf.setAuthor(pill.owner.name);
  d.pdf.setSubject(`${DOC_TYPE}, revision ${rev} (synthetic demonstration data)`);
  d.pdf.setProducer('Intelligence Pills');
  d.pdf.catalog.set(PDFName.of('IPLayout'), PDFName.of(PDF_LAYOUT_MARK));
  return d.pdf.save({ useObjectStreams: false });
}
