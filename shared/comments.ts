// Engineer comments: what the agent read, what it changed, what it kept as a note.
// The reader is Gemini when a key is set (server/gemini.ts), otherwise these offline rules.
// Either way, its output passes through cleanReading() before it touches the plan.
import {
  currentValue, describeValue, detectMentions, fmtTime, MEASURE_IDS, measureById, settingsFor, TUNING_FIELDS, TUNING_IDS,
  type MeasureId, type Tuning, type TuningField,
} from './model.ts';

export type ProposedChange =
  | { kind: 'enable' | 'disable'; measure: MeasureId; quote: string }
  | { kind: 'set'; field: TuningField; value: number; quote: string };

export interface Reading {
  reader: 'gemini' | 'rules';
  reply: string;
  changes: ProposedChange[];
  notes: string[];
  ignored: string[];
  fallbackReason?: string;
}

export interface Plan { measures: MeasureId[]; tuning: Tuning }
export interface AppliedChange { label: string; from: string; to: string; quote: string; field?: TuningField; measure?: MeasureId }
export interface CommentEntry {
  id: string;
  at: string;
  text: string;
  reader: Reading['reader'];
  fallbackReason?: string;
  reply: string;
  applied: AppliedChange[];
  notes: string[];
  ignored: string[];
  before: Plan;
  after: Plan;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isMeasure = (v: unknown): v is MeasureId => typeof v === 'string' && (MEASURE_IDS as string[]).includes(v);
const isField = (v: unknown): v is TuningField => typeof v === 'string' && (TUNING_IDS as string[]).includes(v);

/** Keep only known measures and settings, inside the range the simulator is valid for. Never trust a model's output. */
export function cleanReading(raw: unknown, reader: Reading['reader']): Reading {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const changes: ProposedChange[] = [];
  const ignored: string[] = [];
  for (const item of Array.isArray(o.changes) ? o.changes.slice(0, 12) : []) {
    const c = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const quote = str(c.quote, 200);
    if ((c.kind === 'enable' || c.kind === 'disable') && isMeasure(c.measure)) {
      changes.push({ kind: c.kind, measure: c.measure, quote });
    } else if (c.kind === 'set' && isField(c.field) && typeof c.value === 'number' && Number.isFinite(c.value)) {
      const meta = TUNING_FIELDS[c.field];
      const v = meta.unit === 'time' ? Math.round(c.value * 12) / 12 : meta.unit === 'degC' ? Math.round(c.value * 10) / 10 : Math.round(c.value);
      if (v < meta.min || v > meta.max) {
        ignored.push(`${meta.label} ${describeValue(c.field, v)} is outside what the simulator covers (${describeValue(c.field, meta.min)} to ${describeValue(c.field, meta.max)}).`);
      } else {
        changes.push({ kind: 'set', field: c.field, value: v, quote });
      }
    } else {
      ignored.push(`Skipped a change the simulator can't run${quote ? `: “${quote}”` : ''}.`);
    }
  }
  const notes = (Array.isArray(o.notes) ? o.notes : []).map((n) => str(n, 300)).filter(Boolean).slice(0, 6);
  return { reader, reply: str(o.reply, 300), changes, notes, ignored };
}

// ---------- offline rules: a fixed set of phrasings, used when Gemini is not available ----------

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, 'twenty-five': 25, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60,
};
const NUMWORD = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');
const TIME = `(half past\\s+(?:${NUMWORD})|\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?|(?:${NUMWORD})(?:\\s*(?:am|pm))?)`;
const COUNT = `(\\d{1,2}|${NUMWORD})`;
const NEGATION = /\b(?:don'?t|do not|no longer|stop|skip|drop|remove|without|no need)\b/i;
const CONDITION = /\b(?:if|when|unless|whenever|on (?:hot|cold|rainy|wet) days|above|below)\b/i;

const numberOf = (s: string) => (/^\d/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);

function parseTime(raw: string, isEnd = false): number | null {
  const t = raw.trim().toLowerCase();
  const half = t.match(new RegExp(`^half past\\s+(${NUMWORD})$`));
  if (half) return numberOf(half[1]) + 0.5;
  const m = t.match(new RegExp(`^(\\d{1,2}|${NUMWORD})(?:[:.](\\d{2}))?\\s*(am|pm)?$`));
  if (!m) return null;
  let h = numberOf(m[1]);
  if (h === undefined || h > 23) return null;
  if (m[3] === 'pm' && h < 12) h += 12;
  // A bare early hour as an end time ("until 4") means the afternoon on a working-day schedule.
  if (!m[3] && isEnd && h >= 1 && h <= 7) h += 12;
  return h + (m[2] ? Number(m[2]) / 60 : 0);
}

/** Read a comment with fixed patterns: times, minute gaps, charger counts, degrees, and measure names. */
export function readWithRules(text: string): Reading {
  const changes: Record<string, unknown>[] = [];
  const notes: string[] = [];
  const sentences = text.split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const before = changes.length;
    const set = (field: TuningField, value: number | null, quote: string) => { if (value !== null && Number.isFinite(value)) changes.push({ kind: 'set', field, value, quote }); };
    let m: RegExpMatchArray | null;

    if ((m = s.match(new RegExp(`pre-?cool\\w*[^.]*?\\b(?:at|from|by)\\s+${TIME}`, 'i')) ??
             s.match(new RegExp(`\\bstart\\w*\\s+(?:the\\s+)?(?:chillers|cooling|plant)[^.]*?\\b(?:at|from)\\s+${TIME}`, 'i')))) {
      set('precoolStart', parseTime(m[1]), m[0]);
    }
    if (/chillers?/i.test(s) && (m = s.match(new RegExp(`${COUNT}\\s*-?\\s*min(?:ute)?s?\\b`, 'i'))) && /apart|between|gap|stagger|each|every|one at a time|one by one/i.test(s)) {
      set('staggerGapMin', numberOf(m[1]) ?? null, m[0]);
    }
    if ((m = s.match(new RegExp(`(?:AHUs?|air[- ]handl\\w*)[^.]*?${COUNT}\\s*-?\\s*min`, 'i')))) {
      set('ahuGroupGapMin', numberOf(m[1]) ?? null, m[0]);
    }
    if (/\bEVs?\b|charg/i.test(s)) {
      if ((m = s.match(new RegExp(`${COUNT}\\s+(?:EV\\s+)?chargers?`, 'i')))) set('evChargers', numberOf(m[1]) ?? null, m[0]);
      if ((m = s.match(new RegExp(`\\b(?:from|between|after|at)\\s+${TIME}\\s*(?:to|until|till|and|-|–)\\s*${TIME}`, 'i')))) {
        set('evStart', parseTime(m[1]), m[0]);
        set('evEnd', parseTime(m[2], true), m[0]);
      } else if ((m = s.match(new RegExp(`\\b(?:after|from)\\s+${TIME}`, 'i')))) {
        set('evStart', parseTime(m[1]), m[0]);
      } else if ((m = s.match(new RegExp(`\\b(?:until|till|by)\\s+${TIME}`, 'i')))) {
        set('evEnd', parseTime(m[1], true), m[0]);
      }
    }
    if (/set ?point|thermostat|degree|°/i.test(s)) {
      if ((m = s.match(/\b(\d(?:\.\d)?)\s*(?:°\s*c?|degrees?|deg)\b/i))) set('setpointOffsetC', Number(m[1]), m[0]);
      else if ((m = s.match(/\b(half a|one|a)\s+degree/i))) set('setpointOffsetC', m[1].toLowerCase() === 'half a' ? 0.5 : 1, m[0]);
      if ((m = s.match(new RegExp(`set ?point[^.]*?\\b(?:from|between)\\s+${TIME}\\s*(?:to|until|till|and|-|–)\\s*${TIME}`, 'i')))) {
        set('setpointStart', parseTime(m[1]), m[0]);
        set('setpointEnd', parseTime(m[2], true), m[0]);
      }
    }

    // Measure names switch a measure on, or off after a negation ("don't stagger the chillers").
    const touched = new Set(changes.slice(before).map((c) => TUNING_FIELDS[c.field as TuningField]?.measure));
    for (const [id, quote] of Object.entries(detectMentions(s)) as [MeasureId, string][]) {
      if (touched.has(id)) continue;
      changes.push({ kind: NEGATION.test(s) ? 'disable' : 'enable', measure: id, quote });
    }
    if (changes.length === before || CONDITION.test(s)) notes.push(s);
  }
  return cleanReading({ reply: '', changes, notes }, 'rules');
}

// ---------- applying a reading to the plan ----------

const samePlan = (a: Plan, b: Plan) => a.measures.join() === b.measures.join() && JSON.stringify(a.tuning) === JSON.stringify(b.tuning);
export { samePlan };

export function applyReading(plan: Plan, r: Reading): { plan: Plan; applied: AppliedChange[]; ignored: string[] } {
  const on = new Set<MeasureId>(plan.measures);
  const tuning: Tuning = { ...plan.tuning };
  let applied: AppliedChange[] = [];
  const ignored = [...r.ignored];
  const switchOn = (id: MeasureId, quote: string) => {
    if (on.has(id)) return;
    on.add(id);
    applied.push({ label: measureById(id)!.title, from: 'Off', to: 'On', quote, measure: id });
  };
  for (const ch of r.changes) {
    if (ch.kind === 'enable') switchOn(ch.measure, ch.quote);
    else if (ch.kind === 'disable') {
      if (!on.has(ch.measure)) continue;
      on.delete(ch.measure);
      applied.push({ label: measureById(ch.measure)!.title, from: 'On', to: 'Off', quote: ch.quote, measure: ch.measure });
    } else if (ch.kind === 'set') {
      const meta = TUNING_FIELDS[ch.field];
      switchOn(meta.measure, ch.quote);
      const from = currentValue(ch.field, settingsFor(tuning));
      if (Math.abs(from - ch.value) < 1e-6) continue;
      tuning[ch.field] = ch.value;
      applied = applied.filter((a) => a.field !== ch.field);
      applied.push({ label: meta.label, from: describeValue(ch.field, from), to: describeValue(ch.field, ch.value), quote: ch.quote, field: ch.field });
    }
  }
  // Windows must stay at least an hour long; otherwise keep what was there.
  const windows: [TuningField, TuningField, string][] = [['evStart', 'evEnd', 'EV charging'], ['setpointStart', 'setpointEnd', 'The setpoint raise']];
  for (const [a, b, name] of windows) {
    const s = settingsFor(tuning);
    if (currentValue(b, s) - currentValue(a, s) < 1) {
      const was = settingsFor(plan.tuning);
      for (const f of [a, b]) { if (plan.tuning[f] === undefined) delete tuning[f]; else tuning[f] = plan.tuning[f]; }
      applied = applied.filter((x) => x.field !== a && x.field !== b);
      ignored.push(`${name} would run ${fmtTime(currentValue(a, s))}–${fmtTime(currentValue(b, s))}, under an hour, so I kept ${fmtTime(currentValue(a, was))}–${fmtTime(currentValue(b, was))}.`);
    }
  }
  return { plan: { measures: MEASURE_IDS.filter((m) => on.has(m)), tuning }, applied, ignored };
}

export function defaultReply(applied: AppliedChange[], notes: string[], ignored: string[]) {
  if (applied.length) return `I made ${applied.length} change${applied.length === 1 ? '' : 's'} and re-ran the simulation.`;
  if (notes.length) return "I couldn't turn that into a change I can simulate, so I kept it as a note on the pill.";
  if (ignored.length) return "I couldn't apply that. See why below.";
  return 'Nothing in that comment changes the plan.';
}
