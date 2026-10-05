// Tower A demand model, measures and review agents.
// Ported from the "Intelligence Pills" artifact. Runs in the browser (live preview)
// and on the server (evidence of record). All values are synthetic.

export const STEP_H = 24 / 96;
export const STEPS = 96;

export const TOWER = {
  name: 'Tower A',
  floors: 20,
  contractedCapacityKw: 3000,
  // SB-1 is sized so the agent's plan still leaves it above 90%, and the engineer's own setpoint raise clears it (demo).
  boardRatings: { msb: 3300, sb1: 820, sb2: 900, sb3: 900, sb4: 500 },
};
export type Board = keyof typeof TOWER.boardRatings;
export const BOARDS = Object.keys(TOWER.boardRatings) as Board[];

export const BOARD_NAMES: Record<Board, string> = {
  msb: 'Main switchboard (MSB)',
  sb1: 'Chiller power board (SB-1)',
  sb2: 'Floors 1–10 power board (SB-2)',
  sb3: 'Floors 11–20 power board (SB-3)',
  sb4: 'Lifts & car park power board (SB-4)',
};

export const fmtKw = (kw: number) => `${Math.round(kw).toLocaleString('en-SG')} kW`;
export function fmtTime(h: number) {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
const signed = (n: number, unit: string) => `${sign(n)}${Math.abs(Math.round(n)).toLocaleString('en-SG')}${unit}`;

export const TERMS: Record<string, string> = {
  MSB: `Main switchboard: all of the building's power passes through it. Rated ${fmtKw(TOWER.boardRatings.msb)}.`,
  'SB-1': `Sub-board feeding the 3 chillers, their pumps and cooling towers. Rated ${fmtKw(TOWER.boardRatings.sb1)}.`,
  'SB-2': `Sub-board for floors 1–10: air handlers, lights and tenant sockets. Rated ${fmtKw(TOWER.boardRatings.sb2)}.`,
  'SB-3': `Sub-board for floors 11–20: air handlers, lights and tenant sockets. Rated ${fmtKw(TOWER.boardRatings.sb3)}.`,
  'SB-4': `Sub-board for lifts, car park fans and EV chargers. Rated ${fmtKw(TOWER.boardRatings.sb4)}.`,
  AHU: 'Air handling unit: the fans that push chilled air out to a floor.',
  AHUs: 'Air handling units: the fans that push chilled air out to each floor.',
  inrush: 'The extra power a motor draws for a short time while it starts up.',
  'the cap': `The contracted capacity, ${fmtKw(TOWER.contractedCapacityKw)}. Going over it triggers a penalty.`,
};

export const ARRIVAL: [number, number] = [9, 18];
export const COMFORT_BAND: [number, number] = [23, 25];
const COMFORT = { chillersNeeded: 2, minRunMinutes: 60 };
export const TARIFF = { energyPerKwh: 0.28, demandChargePerKwAboveContracted: 15 };
export const LOADS = {
  chillerKw: 1100, chillerCount: 3, ahuKw: 300, lightsKw: 480, plugKw: 520, liftsKw: 240,
  carparkKw: 50, evChargerKw: 22, evChargers: 10, baseKw: 560,
};
export const CHILLER = { rampMin: 15, inrushMin: 30, decayMin: 45 };
export const SCHEDULE = {
  hvacStop: 19, ahuRampMin: 15, lightsOn: [7, 19] as [number, number], lightsStandbyFrac: 0.08,
  plugRamp: [8.5, 9.5] as [number, number], plugOff: 19, plugAfterHoursFrac: 0.05,
  liftsRush: [8, 9.5] as [number, number], liftsLunch: [12, 13] as [number, number], liftsLunchFrac: 0.3,
  liftsIdleFrac: 0.15, carparkOn: [6.5, 20] as [number, number], carparkOnFrac: 0.6, carparkOffFrac: 0.3,
  evArrival: { start: 8, rampHours: 0.5, fullUntil: 10 },
};
export const TODAY_SETTINGS = { plantStart: 7.75, inrushMult: 1.4, holdingFrac: 0.6 };
export const PILL_SETTINGS = {
  precoolStart: 6, precoolHoldingFrac: 0.5, staggerOffsetsMin: [0, 35, 70], softStartInrush: 1.15,
  ahuGroupGapMin: 20, evManaged: { start: 10, end: 15, chargers: 4 },
  setpoint: { window: [7.5, 10.5] as [number, number], factor: 0.84, offsetC: 0.5 },
};

export type MeasureId = 'precool' | 'stagger' | 'ahuGroups' | 'evShift' | 'setpoint';

// ---------- adjustable settings: what an engineer's comment can change ----------

export type Settings = typeof PILL_SETTINGS;
export type TuningField = 'precoolStart' | 'staggerGapMin' | 'ahuGroupGapMin' | 'evStart' | 'evEnd' | 'evChargers' | 'setpointOffsetC' | 'setpointStart' | 'setpointEnd';
export type Tuning = Partial<Record<TuningField, number>>;
type Unit = 'time' | 'min' | 'chargers' | 'degC';

/** Every setting a comment may change, with the range the simulator is valid for. */
export const TUNING_FIELDS: Record<TuningField, { label: string; measure: MeasureId; unit: Unit; min: number; max: number; meaning: string }> = {
  precoolStart: { label: 'Pre-cool start', measure: 'precool', unit: 'time', min: 4, max: 7.5, meaning: 'time the chillers and AHUs start when pre-cooling' },
  staggerGapMin: { label: 'Gap between chiller starts', measure: 'stagger', unit: 'min', min: 10, max: 60, meaning: 'minutes between one chiller starting and the next' },
  ahuGroupGapMin: { label: 'Gap between AHU groups', measure: 'ahuGroups', unit: 'min', min: 5, max: 60, meaning: 'minutes between floors 1–10 and floors 11–20 starting their AHUs' },
  evStart: { label: 'EV charging starts', measure: 'evShift', unit: 'time', min: 8, max: 16, meaning: 'time managed EV charging starts' },
  evEnd: { label: 'EV charging ends', measure: 'evShift', unit: 'time', min: 11, max: 19, meaning: 'time managed EV charging stops' },
  evChargers: { label: 'EV chargers at once', measure: 'evShift', unit: 'chargers', min: 1, max: 10, meaning: 'most EV chargers allowed to run at the same time' },
  setpointOffsetC: { label: 'Setpoint raise', measure: 'setpoint', unit: 'degC', min: 0.5, max: 1.5, meaning: 'degrees C the cooling setpoint is raised in the morning window' },
  setpointStart: { label: 'Setpoint raise starts', measure: 'setpoint', unit: 'time', min: 6, max: 11, meaning: 'time the raised setpoint starts' },
  setpointEnd: { label: 'Setpoint raise ends', measure: 'setpoint', unit: 'time', min: 8, max: 13, meaning: 'time the setpoint goes back to normal' },
};
export const TUNING_IDS = Object.keys(TUNING_FIELDS) as TuningField[];

/** The pill's settings with an engineer's tuning applied on top of the defaults. */
export function settingsFor(t: Tuning = {}): Settings {
  const P = PILL_SETTINGS;
  const gap = t.staggerGapMin;
  const offset = t.setpointOffsetC ?? P.setpoint.offsetC;
  return {
    ...P,
    precoolStart: t.precoolStart ?? P.precoolStart,
    staggerOffsetsMin: gap === undefined ? P.staggerOffsetsMin : [0, gap, gap * 2],
    ahuGroupGapMin: t.ahuGroupGapMin ?? P.ahuGroupGapMin,
    evManaged: { start: t.evStart ?? P.evManaged.start, end: t.evEnd ?? P.evManaged.end, chargers: t.evChargers ?? P.evManaged.chargers },
    // +0.5 °C keeps the artifact's 0.84 holding factor; each further degree trims 0.32 more.
    setpoint: { window: [t.setpointStart ?? P.setpoint.window[0], t.setpointEnd ?? P.setpoint.window[1]], offsetC: offset, factor: Math.round((1 - 0.32 * offset) * 1000) / 1000 },
  };
}

export function currentValue(f: TuningField, s: Settings): number {
  switch (f) {
    case 'precoolStart': return s.precoolStart;
    case 'staggerGapMin': return s.staggerOffsetsMin[1];
    case 'ahuGroupGapMin': return s.ahuGroupGapMin;
    case 'evStart': return s.evManaged.start;
    case 'evEnd': return s.evManaged.end;
    case 'evChargers': return s.evManaged.chargers;
    case 'setpointOffsetC': return s.setpoint.offsetC;
    case 'setpointStart': return s.setpoint.window[0];
    case 'setpointEnd': return s.setpoint.window[1];
  }
}

export function describeValue(f: TuningField, v: number): string {
  switch (TUNING_FIELDS[f].unit) {
    case 'time': return fmtTime(v);
    case 'min': return `${v} min`;
    case 'chargers': return `${v} charger${v === 1 ? '' : 's'}`;
    case 'degC': return `+${v}°C`;
  }
}
export type Ev = { mode: 'on_arrival' } | { mode: 'managed'; start: number; end: number; chargers: number };
export interface Actions {
  plantStart: number;
  chillerStarts: number[];
  inrushMult: number;
  holdingFrac: number;
  setpoint: typeof PILL_SETTINGS.setpoint | null;
  ahuStarts: number[];
  ev: Ev;
}
export interface Step {
  t: number;
  parts: { chillers: number; chillerSurge: number; ahu: number; lights: number; plug: number; lifts: number; carpark: number; ev: number; base: number };
  sb1: number; sb2: number; sb3: number; sb4: number; msb: number;
}
export type PartKey = keyof Step['parts'];
export interface SimResult {
  actions: Actions;
  series: Step[];
  peakKw: number;
  peakAtHour: number;
  peakIndex: number;
  totalKwh: number;
  evKwh: number;
  costUsd: number;
  comfortHoursAtRisk: number;
  floorsReadyAt: number[];
  maxBoardPct: Record<Board, number>;
  maxBoardAt: Record<Board, number>;
}

const ramp = (h: number, start: number, minutes: number) => (h < start ? 0 : Math.min(1, ((h - start) * 60) / minutes));
const within = (h: number, [a, b]: [number, number]) => h >= a && h < b;
const evFleetKw = () => LOADS.evChargers * LOADS.evChargerKw;

function evKw(h: number, ev: Ev) {
  if (ev.mode === 'managed') return within(h, [ev.start, ev.end]) ? ev.chargers * LOADS.evChargerKw : 0;
  const { start, rampHours, fullUntil } = SCHEDULE.evArrival;
  if (h < start || h >= fullUntil + rampHours) return 0;
  if (h < start + rampHours) return ((h - start) / rampHours) * evFleetKw();
  if (h < fullUntil) return evFleetKw();
  return (1 - (h - fullUntil) / rampHours) * evFleetKw();
}

function chillerKw(h: number, a: Actions) {
  if (h >= SCHEDULE.hvacStop) return { total: 0, surge: 0 };
  const inSetpoint = a.setpoint !== null && within(h, a.setpoint.window);
  const holding = a.holdingFrac * (inSetpoint && a.setpoint ? a.setpoint.factor : 1);
  const each = LOADS.chillerKw / a.chillerStarts.length;
  let total = 0;
  let surge = 0;
  for (const start of a.chillerStarts) {
    if (h < start) continue;
    const min = (h - start) * 60;
    const running = (min < CHILLER.rampMin ? min / CHILLER.rampMin : 1 - Math.min(1, (min - CHILLER.rampMin) / CHILLER.decayMin) * (1 - holding)) * each;
    const extra = min < CHILLER.inrushMin ? running * (a.inrushMult - 1) : 0;
    total += running + extra;
    surge += extra;
  }
  return { total, surge };
}

function buildSeries(a: Actions): Step[] {
  const out: Step[] = [];
  for (let n = 0; n < STEPS; n++) {
    const t = n * STEP_H;
    const ch = chillerKw(t, a);
    const ahu = a.ahuStarts.map((s) => (t >= SCHEDULE.hvacStop ? 0 : ramp(t, s, SCHEDULE.ahuRampMin) * (LOADS.ahuKw / 2)));
    const lights = within(t, SCHEDULE.lightsOn) ? LOADS.lightsKw : LOADS.lightsKw * SCHEDULE.lightsStandbyFrac;
    const plug = t >= SCHEDULE.plugOff
      ? LOADS.plugKw * SCHEDULE.plugAfterHoursFrac
      : ramp(t, SCHEDULE.plugRamp[0], (SCHEDULE.plugRamp[1] - SCHEDULE.plugRamp[0]) * 60) * LOADS.plugKw;
    let liftFrac = SCHEDULE.liftsIdleFrac;
    if (within(t, SCHEDULE.liftsRush)) liftFrac = 1;
    if (within(t, SCHEDULE.liftsLunch)) liftFrac = SCHEDULE.liftsLunchFrac;
    const lifts = LOADS.liftsKw * liftFrac;
    const carpark = LOADS.carparkKw * (within(t, SCHEDULE.carparkOn) ? SCHEDULE.carparkOnFrac : SCHEDULE.carparkOffFrac);
    const ev = evKw(t, a.ev);
    const sb1 = ch.total;
    const sb2 = ahu[0] + lights / 2 + plug / 2;
    const sb3 = ahu[1] + lights / 2 + plug / 2;
    const sb4 = lifts + carpark + ev;
    out.push({
      t,
      parts: { chillers: ch.total, chillerSurge: ch.surge, ahu: ahu[0] + ahu[1], lights, plug, lifts, carpark, ev, base: LOADS.baseKw },
      sb1, sb2, sb3, sb4, msb: sb1 + sb2 + sb3 + sb4 + LOADS.baseKw,
    });
  }
  return out;
}

function comfort(a: Actions) {
  const enough = [...a.chillerStarts].sort((x, y) => x - y)[COMFORT.chillersNeeded - 1];
  const readyAt = a.ahuStarts.map((s) => Math.max(s, enough) + COMFORT.minRunMinutes / 60);
  const [from, to] = ARRIVAL;
  const perGroup = TOWER.floors / 2;
  const hours = readyAt.reduce((sum, r) => sum + Math.max(0, Math.min(r, to) - from) * perGroup, 0);
  return { hoursAtRisk: Math.round(hours * 10) / 10, readyAt };
}

export function simulate(a: Actions): SimResult {
  const series = buildSeries(a);
  const ratings = TOWER.boardRatings;
  let peakIndex = 0;
  let totalKwh = 0;
  let evKwh = 0;
  const maxBoardPct = { msb: 0, sb1: 0, sb2: 0, sb3: 0, sb4: 0 };
  const maxBoardAt = { msb: 0, sb1: 0, sb2: 0, sb3: 0, sb4: 0 };
  series.forEach((s, i) => {
    if (s.msb > series[peakIndex].msb) peakIndex = i;
    totalKwh += s.msb * STEP_H;
    evKwh += s.parts.ev * STEP_H;
    for (const b of BOARDS) {
      const pct = (s[b] / ratings[b]) * 100;
      if (pct > maxBoardPct[b]) { maxBoardPct[b] = pct; maxBoardAt[b] = s.t; }
    }
  });
  const peakKw = series[peakIndex].msb;
  const overCap = Math.max(0, peakKw - TOWER.contractedCapacityKw);
  const c = comfort(a);
  return {
    actions: a, series, peakKw, peakAtHour: series[peakIndex].t, peakIndex, totalKwh, evKwh,
    costUsd: totalKwh * TARIFF.energyPerKwh + overCap * TARIFF.demandChargePerKwAboveContracted,
    comfortHoursAtRisk: c.hoursAtRisk, floorsReadyAt: c.readyAt, maxBoardPct, maxBoardAt,
  };
}

export type BoardStatus = 'overload' | 'warning' | 'ok';
export const boardStatus = (pct: number): BoardStatus => (pct >= 100 ? 'overload' : pct >= 90 ? 'warning' : 'ok');

export function actionsFor(measures: readonly string[], s: Settings = PILL_SETTINGS): Actions {
  const has = (m: MeasureId) => measures.includes(m);
  const start = has('precool') ? s.precoolStart : TODAY_SETTINGS.plantStart;
  return {
    plantStart: start,
    chillerStarts: (has('stagger') ? s.staggerOffsetsMin : Array(LOADS.chillerCount).fill(0)).map((m: number) => start + m / 60),
    inrushMult: has('stagger') ? s.softStartInrush : TODAY_SETTINGS.inrushMult,
    holdingFrac: has('precool') ? s.precoolHoldingFrac : TODAY_SETTINGS.holdingFrac,
    setpoint: has('setpoint') ? s.setpoint : null,
    ahuStarts: has('ahuGroups') ? [start, start + s.ahuGroupGapMin / 60] : [start, start],
    ev: has('evShift') ? { mode: 'managed', ...s.evManaged } : { mode: 'on_arrival' },
  };
}

const simCache = new Map<string, SimResult>();
/** Simulate a set of measures with given settings. Cached: the result depends only on these two inputs. */
export function simulateMeasures(measures: readonly string[], s: Settings = PILL_SETTINGS): SimResult {
  const key = MEASURE_IDS.filter((m) => measures.includes(m)).join(',') + JSON.stringify(s);
  let r = simCache.get(key);
  if (!r) {
    if (simCache.size > 500) simCache.clear();
    r = simulate(actionsFor(measures, s));
    simCache.set(key, r);
  }
  return r;
}
export const baseline = () => simulateMeasures([]);

// ---------- review agents ----------

export type Verdict = 'support' | 'concern' | 'block';
export interface AgentComment { agent: string; verdict: Verdict; points: string[]; cites: string[] }

function energyAgent(base: SimResult, fix: SimResult): AgentComment {
  const cap = TOWER.contractedCapacityKw;
  const dPeak = fix.peakKw - base.peakKw;
  const dKwh = fix.totalKwh - base.totalKwh;
  const dCost = fix.costUsd - base.costUsd;
  const ev = fix.actions.ev;
  return {
    agent: 'Energy',
    verdict: dPeak < 0 && fix.peakKw <= cap ? 'support' : 'concern',
    points: [
      `Peak ${signed((dPeak / base.peakKw) * 100, '%')}: ${fmtKw(base.peakKw)} (${fmtTime(base.peakAtHour)}) → ${fmtKw(fix.peakKw)} (${fmtTime(fix.peakAtHour)}).`,
      fix.peakKw > cap ? `Still ${fmtKw(fix.peakKw - cap)} over the cap.` : `${fmtKw(cap - fix.peakKw)} under the cap.`,
      `Energy ${signed(dKwh, ' kWh')} a day.` + (dKwh > 0 ? ' Pre-cooling adds run time.' : ''),
      ...(ev.mode === 'managed' ? [`EV still gets ${Math.round(fix.evKwh)} kWh (${fmtTime(ev.start)}–${fmtTime(ev.end)}).`] : []),
      `Cost ${sign(dCost)}$${Math.abs(Math.round(dCost)).toLocaleString('en-SG')}/day (placeholder tariff).`,
    ],
    cites: ['peak_kw', 'total_kwh', 'ev_kwh', 'cost_usd'],
  };
}

function tenantAgent(base: SimResult, fix: SimResult): AgentComment {
  const [g1, g2] = fix.floorsReadyAt;
  const sp = fix.actions.setpoint;
  return {
    agent: 'Tenant Experience',
    verdict: fix.comfortHoursAtRisk <= base.comfortHoursAtRisk ? 'support' : 'concern',
    points: [
      `Hours floors may be too warm: ${base.comfortHoursAtRisk} → ${fix.comfortHoursAtRisk}.`,
      `Floors ready ${fmtTime(g1)} (1–10) and ${fmtTime(g2)} (11–20); arrivals at 09:00.`,
      ...(sp ? [`Setpoint +${sp.offsetC}°C ${fmtTime(sp.window[0])}–${fmtTime(sp.window[1])}: check floors stay in ${COMFORT_BAND[0]}–${COMFORT_BAND[1]}°C.`] : []),
    ],
    cites: ['comfort_hours_at_risk', 'floors_ready_at'],
  };
}

/** Most chiller starts that fall inside one inrush window. */
export function stackedStarts(starts: number[]) {
  const s = [...starts].sort((a, b) => a - b);
  const w = CHILLER.inrushMin / 60;
  return Math.max(...s.map((a) => s.filter((b) => b >= a && b - a < w).length));
}

const worstBoard = (r: SimResult) => BOARDS.reduce((a, b) => (r.maxBoardPct[a] >= r.maxBoardPct[b] ? a : b));

function technicalAgent(fix: SimResult): AgentComment {
  const over = BOARDS.filter((b) => fix.maxBoardPct[b] >= 100);
  const high = BOARDS.filter((b) => fix.maxBoardPct[b] >= 90 && fix.maxBoardPct[b] < 100);
  const worst = worstBoard(fix);
  const stacked = stackedStarts(fix.actions.chillerStarts);
  return {
    agent: 'Technical Services',
    verdict: over.length ? 'block' : high.length ? 'concern' : 'support',
    points: [
      `Worst board: ${BOARD_NAMES[worst]} ${Math.round(fix.maxBoardPct[worst])}% at ${fmtTime(fix.maxBoardAt[worst])}.`,
      over.length ? `${over.map((b) => BOARD_NAMES[b]).join(', ')} over rating: blocked and escalated.`
        : high.length ? `${high.map((b) => BOARD_NAMES[b]).join(', ')} above 90%.` : 'All boards under 90%.',
      stacked > 1 ? `${stacked} chillers start within ${CHILLER.inrushMin} min: surges stack.` : `Chiller starts spaced beyond the ${CHILLER.inrushMin}-min surge.`,
    ],
    cites: ['max_board_loading_pct', 'chiller_starts'],
  };
}

export interface Review { comments: AgentComment[]; authority: 'approve' | 'escalate' }
export function reviewAgents(base: SimResult, fix: SimResult): Review {
  const comments = [energyAgent(base, fix), tenantAgent(base, fix), technicalAgent(fix)];
  return { comments, authority: comments.some((c) => c.verdict === 'block') ? 'escalate' : 'approve' };
}

// ---------- diagnosis of today's schedule ----------

export function diagnose(r: SimResult) {
  const p = r.series[r.peakIndex].parts;
  const a = r.actions;
  const contributors = [
    { label: 'Chiller plant', kw: p.chillers, surgeKw: p.chillerSurge },
    { label: 'Always-on base load', kw: p.base },
    { label: 'Lighting', kw: p.lights },
    { label: 'Air handlers (AHUs)', kw: p.ahu },
    { label: 'Lifts', kw: p.lifts },
    { label: 'Tenant plug loads', kw: p.plug },
    { label: 'EV chargers', kw: p.ev },
    { label: 'Car park fans', kw: p.carpark },
  ].filter((c) => c.kw >= 1).sort((x, y) => y.kw - x.kw);
  return {
    peakKw: r.peakKw,
    peakAtHour: r.peakAtHour,
    overCapKw: Math.max(0, r.peakKw - TOWER.contractedCapacityKw),
    plantStart: a.plantStart,
    startsTogether: [...a.chillerStarts, ...a.ahuStarts].every((s) => s === a.plantStart),
    chillerSurgeKw: p.chillerSurge,
    contributors,
    stressedBoards: BOARDS.filter((b) => r.maxBoardPct[b] >= 90).sort((x, y) => r.maxBoardPct[y] - r.maxBoardPct[x])
      .map((b) => ({ key: b, pct: r.maxBoardPct[b], at: r.maxBoardAt[b] })),
    evPeakKw: Math.max(...r.series.map((s) => s.parts.ev)),
    evKwh: r.evKwh,
    sb4Pct: r.maxBoardPct.sb4,
  };
}
export type Diagnosis = ReturnType<typeof diagnose>;

// ---------- measures (the agent's options) ----------

/** Energy the cars need each weekday, the same as charging on arrival delivers. */
export const EV_DAILY_KWH = LOADS.evChargers * LOADS.evChargerKw * (SCHEDULE.evArrival.fullUntil - SCHEDULE.evArrival.start);
export const evDelivered = (s: Settings) => s.evManaged.chargers * LOADS.evChargerKw * Math.max(0, s.evManaged.end - s.evManaged.start);
export const ARRIVAL_BAND = { from: SCHEDULE.liftsRush[0], to: SCHEDULE.liftsRush[1], label: 'Arrival rush' };
const SB1_LIMIT = { value: TOWER.boardRatings.sb1, label: `SB-1 rating ${fmtKw(TOWER.boardRatings.sb1)}` };
type Band = { from: number; to: number; label: string };

export interface Measure {
  id: MeasureId;
  title: string;
  kind: 'industry' | 'cross-domain';
  inspiredBy: string;
  origin: string;
  /** Text and chart follow the case's settings, so a tuned pill describes itself correctly. */
  gist: (s: Settings) => string;
  chart: (s: Settings) => { title: string; part: PartKey; window: [number, number]; band: Band; limit?: { value: number; label: string } };
  why: (d: Diagnosis, s: Settings) => string;
  tradeoff: (s: Settings) => string;
  simChange: (s: Settings) => string;
  /** Systems this measure touches; the library search matches pills on these. */
  tags: string[];
}

export const MEASURES: Measure[] = [
  {
    id: 'precool', title: 'Pre-cool before people arrive', kind: 'industry', inspiredBy: 'Demand-response pre-cooling',
    gist: (s) => `Cooling starts at ${fmtTime(s.precoolStart)}, so the chillers' hardest work is done before the rush.`,
    chart: () => ({ title: 'Chiller plant, kW', part: 'chillers', window: [4, 11], band: ARRIVAL_BAND, limit: SB1_LIMIT }),
    origin: "Standard demand-response practice in commercial buildings: run cooling early, while demand is low, and let the building's thermal mass carry it through the peak.",
    why: (d, s) => `The plant starts at ${fmtTime(d.plantStart)}, so its hardest work, pulling the building down from its overnight temperature, lands on the ${fmtTime(d.peakAtHour)} arrival rush. Starting at ${fmtTime(s.precoolStart)} moves that work into a quiet window.`,
    tradeoff: (s) => `Chillers run about ${Math.round((TODAY_SETTINGS.plantStart - s.precoolStart) * 60)} minutes longer each morning. On its own it doesn't stop all three chillers starting together; their start-up surge just moves to ${fmtTime(s.precoolStart)}.`,
    simChange: (s) => `Cooling plant and AHUs start ${fmtTime(TODAY_SETTINGS.plantStart)} → ${fmtTime(s.precoolStart)}. Chiller holding load after pull-down ${TODAY_SETTINGS.holdingFrac * 100}% → ${s.precoolHoldingFrac * 100}% of full load.`,
    tags: ['hvac-chiller', 'hvac-schedule'],
  },
  {
    id: 'stagger', title: 'Soft-start and stagger the chillers', kind: 'cross-domain', inspiredBy: 'Motor soft-starters, disk spin-up',
    gist: (s) => s.staggerOffsetsMin[1] >= CHILLER.inrushMin
      ? `One chiller starts every ${s.staggerOffsetsMin[1]} minutes, so start-up surges never stack.`
      : `One chiller starts every ${s.staggerOffsetsMin[1]} minutes, inside the ${CHILLER.inrushMin}-minute surge window, so surges still overlap.`,
    chart: () => ({ title: 'Chiller plant, kW', part: 'chillers', window: [4, 11], band: ARRIVAL_BAND, limit: SB1_LIMIT }),
    origin: 'Borrowed from electrical drives and data centres. Motor soft-starters ramp up gently to limit inrush current, and disk arrays spin drives up one after another so the power supply never sees every motor start at once.',
    why: (d, s) => `All ${LOADS.chillerCount} chillers start at ${fmtTime(d.plantStart)} and each draws about ${TODAY_SETTINGS.inrushMult}× its running power while starting: a ${fmtKw(d.chillerSurgeKw)} surge on SB-1. Starting at part load softens each surge, but three starts in the same quarter-hour still stack. ` +
      (s.staggerOffsetsMin[1] >= CHILLER.inrushMin
        ? `Spacing them ${s.staggerOffsetsMin[1]} minutes apart, longer than the ${CHILLER.inrushMin}-minute start-up window, means only one is ever starting.`
        : `Spacing them ${s.staggerOffsetsMin[1]} minutes apart is shorter than the ${CHILLER.inrushMin}-minute start-up window, so two surges still overlap.`),
    tradeoff: (s) => `The last chiller comes online ${s.staggerOffsetsMin[2]} minutes after the first. Without pre-cooling, that lands in the arrival rush and floors may still be warm at 09:00.`,
    simChange: (s) => `Chiller starts spaced ${s.staggerOffsetsMin.join(' / ')} min apart. Start-up surge ${TODAY_SETTINGS.inrushMult.toFixed(2)}× → ${s.softStartInrush.toFixed(2)}× running power.`,
    tags: ['hvac-chiller', 'electrical-sb1'],
  },
  {
    id: 'ahuGroups', title: 'Start the air handlers in two groups', kind: 'cross-domain', inspiredBy: 'Highway ramp metering',
    gist: (s) => `Floors 11–20 start ${s.ahuGroupGapMin} min after floors 1–10, so the fan load climbs in two steps.`,
    chart: () => ({ title: 'AHU fans, kW', part: 'ahu', window: [4, 10], band: ARRIVAL_BAND }),
    origin: 'Inspired by highway ramp metering: signals on the on-ramp let cars onto the motorway in small batches, so the same number of cars get through without jamming the main road.',
    why: (_d, s) => `All ${TOWER.floors} floors' AHUs (${fmtKw(LOADS.ahuKw)}) switch on in the same 15 minutes. Releasing floors 1–10 first and floors 11–20 ${s.ahuGroupGapMin} minutes later spreads that step.`,
    tradeoff: (s) => `Floors 11–20 start cooling ${s.ahuGroupGapMin} minutes later. With pre-cooling that makes no difference to comfort; without it, upper floors may be slightly warm at 09:00.`,
    simChange: (s) => `AHUs for floors 11–20 start ${s.ahuGroupGapMin} min after floors 1–10.`,
    tags: ['hvac-air', 'hvac-schedule'],
  },
  {
    id: 'evShift', title: 'Managed EV charging after the rush', kind: 'industry', inspiredBy: 'Smart charging in car parks',
    gist: (s) => {
      const got = Math.round(evDelivered(s));
      const when = `${fmtTime(s.evManaged.start)}–${fmtTime(s.evManaged.end)} on at most ${s.evManaged.chargers} charger${s.evManaged.chargers === 1 ? '' : 's'}`;
      return got >= EV_DAILY_KWH - 1 ? `Same ${Math.round(EV_DAILY_KWH)} kWh, spread over ${when}.` : `Only ${got} kWh over ${when}, short of the ${Math.round(EV_DAILY_KWH)} kWh cars need.`;
    },
    chart: () => ({ title: 'EV charging, kW', part: 'ev', window: [7, 19], band: ARRIVAL_BAND }),
    origin: 'Managed (smart) charging is standard in commercial car parks: a load manager caps how many chargers run at once and fills cars across the day instead of on arrival.',
    why: (d, s) => `${LOADS.evChargers} chargers switch on as cars arrive from 08:00 and add up to ${fmtKw(d.evPeakKw)} while the lifts are at full load, keeping SB-4 at ${Math.round(d.sb4Pct)}% of its rating. Charging between ${fmtTime(s.evManaged.start)} and ${fmtTime(s.evManaged.end)} on at most ${s.evManaged.chargers} chargers needs only ${fmtKw(s.evManaged.chargers * LOADS.evChargerKw)}.`,
    tradeoff: (s) => `Cars that arrive at 08:00 wait until ${fmtTime(s.evManaged.start)} to start charging, and finish by ${fmtTime(s.evManaged.end)} instead of mid-morning.`,
    simChange: (s) => {
      const got = Math.round(evDelivered(s));
      return `EV charging on arrival (up to ${LOADS.evChargers} chargers) → managed ${fmtTime(s.evManaged.start)}–${fmtTime(s.evManaged.end)}, max ${s.evManaged.chargers} chargers. ` +
        (got >= EV_DAILY_KWH - 1 ? 'Energy delivered unchanged.' : `Energy delivered ${Math.round(EV_DAILY_KWH)} → ${got} kWh.`);
    },
    tags: ['ev-charging', 'electrical-sb4'],
  },
  {
    id: 'setpoint', title: 'Raise the setpoint during the morning', kind: 'industry', inspiredBy: 'Global temperature adjustment',
    gist: (s) => `+${s.setpoint.offsetC}°C from ${fmtTime(s.setpoint.window[0])} to ${fmtTime(s.setpoint.window[1])}, so the chillers work a little less.`,
    chart: (s) => ({ title: 'Chiller plant, kW', part: 'chillers', window: [6, 13.5], band: { from: s.setpoint.window[0], to: s.setpoint.window[1], label: `+${s.setpoint.offsetC}°C window` } }),
    origin: 'A common demand-response lever, often called global temperature adjustment: nudge cooling setpoints up slightly for a few hours while staying inside the comfort band.',
    why: (_d, s) => `Between ${fmtTime(s.setpoint.window[0])} and ${fmtTime(s.setpoint.window[1])}, a slightly higher setpoint lets the chillers work less while floors stay inside the ${COMFORT_BAND[0]}–${COMFORT_BAND[1]}°C band. It only helps if the remaining peak falls inside that window.`,
    tradeoff: (s) => `Floors run a little warmer in the morning, and people near windows notice first. Bring the setpoint back down gradually after ${fmtTime(s.setpoint.window[1])} to avoid a rebound spike.`,
    simChange: (s) => `Setpoint +${s.setpoint.offsetC}°C: chiller holding load × ${s.setpoint.factor} between ${fmtTime(s.setpoint.window[0])} and ${fmtTime(s.setpoint.window[1])}.`,
    tags: ['hvac-chiller', 'tenant-comfort'],
  },
];
export const MEASURE_IDS = MEASURES.map((m) => m.id);
export const measureById = (id: string) => MEASURES.find((m) => m.id === id);

export const OUT_OF_SCOPE = [
  { title: 'Chilled-water or ice thermal storage', origin: 'Industry practice', note: 'Charge a tank overnight, discharge it at the peak. Needs a tank, piping and controls.' },
  { title: 'Battery storage for peak shaving', origin: 'Industry practice', note: "Clips whatever peak remains. Worth pricing only if schedule changes aren't enough." },
];

// ---------- the agent: read notes, check, recommend, question ----------

const MENTIONS: Record<MeasureId, RegExp> = {
  precool: /\bpre-?cool\w*|\bat (?:six|6)\b|\b0?6(?::00)?\s?am\b|\bearly start\b|\bstart (?:them |the chillers )?early\b/i,
  stagger: /\bchillers?\b[^.]{0,60}\b(?:stagger\w*|one at a time|one by one|in sequence|spaced? out|soft[- ]?start\w*)|\b(?:stagger\w*|soft[- ]?start\w*)\b[^.]{0,40}\bchillers?\b/i,
  ahuGroups: /\b(?:AHUs?|air[- ]handl\w*)\b[^.]{0,60}\b(?:groups?|batch\w*|stagger\w*|apart|in turn)\b/i,
  evShift: /\b(?:EVs?|electric vehicles?)\b[^.]{0,40}\bcharg\w*|\bcar charg\w*/i,
  setpoint: /\bset ?points?\b|\bthermostat\b|\bhalf a degree\b|\b0\.5\s?°?\s?C\b/i,
};

/** Which measures the engineer's own words mention, with the phrase that matched. */
export function detectMentions(text: string): Partial<Record<MeasureId, string>> {
  const out: Partial<Record<MeasureId, string>> = {};
  for (const m of MEASURES) {
    const hit = text.match(MENTIONS[m.id]);
    if (hit) out[m.id] = hit[0].trim();
  }
  return out;
}

export type NoteLevel = 'block' | 'warn' | 'info' | 'ok';
export interface Note { level: NoteLevel; text: string }

/** The agent's live check of a selection, re-run on every change. */
export function checkSelection(measures: readonly string[], fix: SimResult, base: SimResult, s: Settings = PILL_SETTINGS): Note[] {
  if (measures.length === 0) return [{ level: 'info', text: 'Tick a measure to see its effect.' }];
  const has = (m: string) => measures.includes(m);
  const cap = TOWER.contractedCapacityKw;
  const notes: Note[] = [];
  for (const b of BOARDS.filter((x) => fix.maxBoardPct[x] >= 100)) {
    const head = `${BOARD_NAMES[b]} hits ${Math.round(fix.maxBoardPct[b])}% at ${fmtTime(fix.maxBoardAt[b])}`;
    notes.push({
      level: 'block',
      text: b === 'sb1' && !has('stagger')
        ? `${head}: all ${LOADS.chillerCount} chillers still start together. Add “Soft-start and stagger the chillers”.`
        : `${head}. Technical Services will block this.`,
    });
  }
  if (fix.peakKw > cap) notes.push({ level: 'warn', text: `Peak ${fmtKw(fix.peakKw)} at ${fmtTime(fix.peakAtHour)} is still over the ${fmtKw(cap)} cap.` });
  if (fix.comfortHoursAtRisk > base.comfortHoursAtRisk) {
    notes.push({ level: 'warn', text: `Floors aren't ready until ${fmtTime(Math.max(...fix.floorsReadyAt))}, after the 09:00 arrivals.` + (has('precool') ? '' : ' Add pre-cooling.') });
  }
  for (const b of BOARDS.filter((x) => fix.maxBoardPct[x] >= 90 && fix.maxBoardPct[x] < 100)) {
    notes.push({ level: 'warn', text: `${BOARD_NAMES[b]} at ${Math.round(fix.maxBoardPct[b])}% at ${fmtTime(fix.maxBoardAt[b])}, over the 90% line.` + (b === 'sb4' && !has('evShift') ? ' Managed EV charging fixes it.' : '') });
  }
  if (has('evShift') && evDelivered(s) < EV_DAILY_KWH - 1) {
    notes.push({ level: 'warn', text: `Managed charging delivers ${Math.round(evDelivered(s))} kWh, short of the ${Math.round(EV_DAILY_KWH)} kWh the cars need. Widen the window or allow more chargers.` });
  }
  if (has('setpoint') && s.setpoint.offsetC > 1) {
    notes.push({ level: 'warn', text: `+${s.setpoint.offsetC}°C may take floors above ${COMFORT_BAND[1]}°C before ${fmtTime(s.setpoint.window[1])}. Tenant Experience will want a sign-off.` });
  }
  if (has('setpoint')) {
    const without = simulateMeasures(measures.filter((m) => m !== 'setpoint'), s);
    const dPeak = without.peakKw - fix.peakKw;
    const dKwh = Math.round(without.totalKwh - fix.totalKwh);
    notes.push({
      level: 'info',
      text: dPeak < 1 ? `The setpoint change doesn't lower the ${fmtTime(fix.peakAtHour)} peak, but saves ${dKwh} kWh a day.` : `The setpoint change takes ${fmtKw(dPeak)} off the peak and saves ${dKwh} kWh a day.`,
    });
  }
  if (!notes.some(isProblem)) notes.unshift({ level: 'ok', text: 'Every board under 90%, peak under the cap, comfort unchanged.' });
  return notes;
}
export const isProblem = (n: Note) => n.level === 'block' || n.level === 'warn';

function addReason(id: MeasureId, r: SimResult, label: string): string {
  switch (id) {
    case 'stagger':
      return r.maxBoardPct.sb1 >= 100
        ? `${label} starts all ${LOADS.chillerCount} chillers together, so the ${BOARD_NAMES.sb1} hits ${Math.round(r.maxBoardPct.sb1)}% at ${fmtTime(r.maxBoardAt.sb1)}. Spacing the starts fixes that.`
        : 'Spaces the chiller starts so their start-up surges (inrush) never stack.';
    case 'precool':
      return r.peakKw > TOWER.contractedCapacityKw
        ? `${label} still peaks at ${fmtKw(r.peakKw)} at ${fmtTime(r.peakAtHour)}, over the cap. Pre-cooling moves the chillers' hardest work before the rush.`
        : r.comfortHoursAtRisk > 0
          ? `Floors aren't ready until ${fmtTime(Math.max(...r.floorsReadyAt))}. Pre-cooling gives the plant time to finish starting before people arrive.`
          : "Moves the chillers' hardest work before the rush.";
    case 'evShift':
      return r.maxBoardPct.sb4 >= 90
        ? `Cars charging on arrival keep the ${BOARD_NAMES.sb4} at ${Math.round(r.maxBoardPct.sb4)}%. Managed charging spreads the same energy over the day.`
        : 'Takes EV charging out of the morning rush.';
    case 'ahuGroups':
      return 'Spreads the air handler start over 20 minutes instead of one step.';
    case 'setpoint':
      return 'Trims chiller load during the morning window.';
  }
}

export interface Recommendation {
  fromUser: MeasureId[];
  added: { id: MeasureId; reason: string }[];
  measures: MeasureId[];
  clear: boolean;
}

/** The agent never raises a setpoint on its own: tenants feel it, so an engineer has to propose it. */
const ENGINEER_ONLY: MeasureId[] = ['setpoint'];

/** Keep everything the engineer chose, then add the fewest measures that clear the most checks. */
export function recommend(fromUser: readonly MeasureId[], s: Settings = PILL_SETTINGS): Recommendation {
  const base = baseline();
  const rest = MEASURE_IDS.filter((m) => !fromUser.includes(m) && !ENGINEER_ONLY.includes(m));
  const best = Array.from({ length: 1 << rest.length }, (_, bits) => rest.filter((_, i) => bits & (1 << i)))
    .map((extra) => {
      const measures = MEASURE_IDS.filter((m) => fromUser.includes(m) || extra.includes(m));
      const result = simulateMeasures(measures, s);
      const notes = checkSelection(measures, result, base, s);
      return { extra, measures, result, blocks: notes.filter((n) => n.level === 'block').length, problems: notes.filter(isProblem).length };
    })
    .filter((c) => c.measures.length > 0)
    // A board over its rating outranks any number of warnings.
    .sort((a, b) => a.blocks - b.blocks || a.problems - b.problems || a.extra.length - b.extra.length || a.result.peakKw - b.result.peakKw)[0];
  const current = simulateMeasures(fromUser, s);
  const label = fromUser.length ? 'Your plan' : "Today's schedule";
  return {
    fromUser: [...fromUser],
    added: best.extra.map((id) => ({ id, reason: addReason(id, current, label) })),
    measures: best.measures,
    clear: best.problems === 0,
  };
}

export const PERSPECTIVES = ['Energy', 'Tenant Experience', 'Technical Services', 'General'] as const;
export type Perspective = (typeof PERSPECTIVES)[number];
export interface Question { id: string; perspective: Perspective; question: string }

/** Questions a reviewer would ask about this particular selection. */
export function questionsFor(measures: readonly string[], fix: SimResult, base: SimResult, s: Settings = PILL_SETTINGS): Question[] {
  const has = (m: string) => measures.includes(m);
  const cap = TOWER.contractedCapacityKw;
  const stressed = BOARDS.filter((b) => fix.maxBoardPct[b] >= 90).sort((x, y) => fix.maxBoardPct[y] - fix.maxBoardPct[x]);
  const dKwh = fix.totalKwh - base.totalKwh;
  const stacked = stackedStarts(fix.actions.chillerStarts);
  const q: Question[] = [];
  q.push({
    id: 'energy-tradeoff', perspective: 'Energy',
    question: dKwh > 1
      ? `This adds about ${Math.round(dKwh)} kWh a day to run (extra chiller and AHU runtime). What's the case that the peak cut is worth that?`
      : dKwh < -1
        ? `Energy drops by about ${Math.round(Math.abs(dKwh))} kWh a day too. Does that match what you'd expect from the changes you made, or is it worth double-checking?`
        : 'Energy use barely moves. Is the peak cut alone worth proposing this, or does it need to save energy too to be worth the change?',
  });
  if (fix.peakKw > cap) q.push({ id: 'energy-still-over', perspective: 'Energy', question: `Peak is still ${fmtKw(fix.peakKw - cap)} over the ${fmtKw(cap)} cap. Does another measure close the rest of the gap, or is this pill one step of several?` });
  if (fix.comfortHoursAtRisk > 0) q.push({ id: 'tenant-comfort', perspective: 'Tenant Experience', question: `Floors aren't ready until ${fmtTime(Math.max(...fix.floorsReadyAt))}, against a ${fmtTime(ARRIVAL[0])} arrival. Who should hear that before a tenant reports it?` });
  if (has('setpoint')) q.push({ id: 'tenant-setpoint', perspective: 'Tenant Experience', question: `The setpoint runs +${s.setpoint.offsetC}°C between ${fmtTime(s.setpoint.window[0])} and ${fmtTime(s.setpoint.window[1])}. Who signs off on that, and how would you find out if someone was uncomfortable?` });
  if (!q.some((x) => x.perspective === 'Tenant Experience')) q.push({ id: 'tenant-general', perspective: 'Tenant Experience', question: 'Nothing here changes comfort on paper. What would tell you that assumption is wrong in practice?' });
  if (stressed.length) {
    const b = stressed[0];
    q.push({ id: 'tech-board', perspective: 'Technical Services', question: `${BOARD_NAMES[b]} reaches ${Math.round(fix.maxBoardPct[b])}% at ${fmtTime(fix.maxBoardAt[b])}. Is that inside what Technical Services will sign off on?` });
  }
  if (stacked > 1) q.push({ id: 'tech-stacked', perspective: 'Technical Services', question: `${stacked} chillers still start within the ${CHILLER.inrushMin}-minute surge window. Is that within limits, or does the stagger need to widen?` });
  if (!q.some((x) => x.perspective === 'Technical Services')) q.push({ id: 'tech-general', perspective: 'Technical Services', question: "What happens if a chiller or AHU doesn't start on schedule? Does the sequence recover on its own, or does someone need to step in?" });
  q.push({ id: 'general-conditions', perspective: 'General', question: "Is there an outdoor temperature or humidity above which you wouldn't run this schedule?" });
  q.push({ id: 'general-watch', perspective: 'General', question: "What's the first sign it isn't working, that a building manager should watch for?" });
  return q;
}

// ---------- sample content (from the artifact) ----------

export const PILL_NAME = 'Morning start-up peak shaving';

export const SAMPLE_PROBLEM =
  'Tower A goes over its contracted capacity every weekday morning, around 08:00 as people start arriving. ' +
  'At Tower A I start the chillers at six at half load, bring the AHUs on in two groups twenty minutes apart, ' +
  'and push EV charging to after ten. The spike drops and the floors are still cool by nine.';

/** The demo comment: rough on purpose. It proposes the one measure the agent never picks, at +1 °C. */
export const SAMPLE_COMMENT =
  'we cld also bump the setpoint up 1 degree from 7.30 to 10.30, tenants wont notice n the chillers work less during the rush';

export const SAMPLE_ANSWERS: Record<string, string> = {
  'energy-tradeoff': "Yes. The chillers settle to a lower holding load after pre-cooling, so the earlier start roughly pays for itself. We'll confirm on the meter after two weeks.",
  'tenant-general': 'Helpdesk calls about warm floors before 09:30, and lobby readings above 25°C.',
  'tech-general': 'The BMS retries a failed start after 10 minutes. If a chiller faults, the duty engineer is alarmed and starts the standby by hand.',
  'general-conditions': "If it's above 30°C outdoors at 06:00, start pre-cooling 30 minutes earlier.",
  'general-watch': 'Floors still above 25°C at 08:45, or the chiller power board climbing past 90% at start-up.',
};
