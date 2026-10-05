// Cases, pills and the governed workflow. Pure functions: the server applies them,
// the tests exercise them, the browser reads the same types.
import {
  baseline, detectMentions, fmtKw, MEASURE_IDS, measureById, PILL_NAME, questionsFor, recommend, reviewAgents,
  SAMPLE_ANSWERS, SAMPLE_PROBLEM, settingsFor, simulateMeasures, TOWER,
  type MeasureId, type Tuning, type Verdict,
} from './model.ts';
import { applyReading, defaultReply, samePlan, type CommentEntry, type Reading } from './comments.ts';

export type Role = 'engineer' | 'manager';
export interface User { id: string; name: string; role: Role; title: string; scope: string; photo?: string }
/** What each person sets on their profile page. The email address stays on the server. */
export interface Profile { email: string; notify: boolean; photo?: string }

export const USERS: User[] = [
  { id: 'wei_ming', name: 'Wei Ming Tan', role: 'engineer', title: 'Senior M&E Engineer', scope: 'Tower A' },
  { id: 'priya', name: 'Priya Nair', role: 'manager', title: 'Asset Operations Manager', scope: 'Tower A, Tower B, DC-1, Logistics Hub' },
];
export const ESCALATION_ROLE = 'Head of Technical Services';
export const userById = (id: string | null | undefined) => USERS.find((u) => u.id === id);

// ---------- pills ----------

export interface Pill {
  id: string;
  title: string;
  summary: string;
  domain: string;
  system: string;
  tags: string[];
  owner: { name: string; title: string; site: string };
  /** The simulator measure this pill carries, when it is one. */
  measureId?: MeasureId;
  /** Tags that make this pill a required check before execution. */
  checkFor?: string[];
  steps: string[];
  guardrails: string[];
  tools: string[];
  knowHow?: { question: string; answer: string }[];
  composedOf?: string[];
  checks?: string[];
  sites: string[];
  status: 'approved' | 'live';
  revisions: { rev: number; date: string; by: string; note: string }[];
  ratings: { rating: number; by: string; reason: string; at: string }[];
  caseId?: string;
}

/** Pill health is the manager's latest star rating (user decision, 2026-10-04). */
export const health = (p: Pill) => p.ratings.at(-1)?.rating ?? null;
export const currentRev = (p: Pill) => p.revisions.at(-1)?.rev ?? 1;

export function seedPills(): Pill[] {
  return [
    {
      id: 'PILL-0007', title: 'Chiller soft-start and stagger', domain: 'Technical Services', system: 'HVAC · chiller plant',
      summary: 'Start chillers one at a time at part load, so their start-up surges never stack on the chiller power board.',
      tags: ['hvac-chiller', 'electrical-sb1'], measureId: 'stagger',
      owner: { name: 'Ahmad Faizal', title: 'Chief Engineer', site: 'DC-1' },
      steps: [
        'Enable soft-start (part-load start) on each chiller starter.',
        'Start chiller 1, then wait at least 35 minutes before the next one. That is longer than the 30-minute surge window.',
        'Watch the chiller power board during each start. It should stay under 90% of its rating.',
      ],
      guardrails: [
        'Never start two chillers inside the same 30-minute surge window.',
        'If a start fails, the next chiller waits. Do not shorten the gaps to catch up.',
      ],
      tools: ['BMS chiller sequencing'],
      sites: ['DC-1'], status: 'live',
      revisions: [
        { rev: 1, date: '2025-11-03', by: 'Ahmad Faizal', note: 'First issue at DC-1.' },
        { rev: 2, date: '2026-04-17', by: 'Ahmad Faizal', note: 'Gap widened from 20 to 35 minutes after a starter fault.' },
      ],
      ratings: [
        { rating: 4, by: 'Priya Nair', reason: 'Worked first time at DC-1.', at: '2025-11-10' },
        { rating: 5, by: 'Priya Nair', reason: 'No starter trips since the gap was widened.', at: '2026-05-20' },
      ],
    },
    {
      id: 'PILL-0012', title: 'Managed EV charging window', domain: 'Energy', system: 'EV charging',
      summary: 'Cap how many EV chargers run at once and fill cars after the morning rush instead of on arrival.',
      tags: ['ev-charging', 'electrical-sb4'], measureId: 'evShift',
      owner: { name: 'Grace Lim', title: 'Facilities Manager', site: 'Logistics Hub' },
      steps: [
        'Set the charger load manager to start charging at 10:00.',
        'Cap simultaneous chargers at 4 (88 kW).',
        'Finish by 15:00 so cars leave full.',
      ],
      guardrails: [
        'Total energy delivered must stay the same as charging on arrival.',
        'Drivers with an urgent need can override from the app. Log every override.',
      ],
      tools: ['Charger load manager'],
      sites: ['Logistics Hub', 'Tower B'], status: 'live',
      revisions: [{ rev: 1, date: '2026-01-12', by: 'Grace Lim', note: 'First issue at the Logistics Hub.' }],
      ratings: [{ rating: 4, by: 'Priya Nair', reason: 'Lifts board stays under 90% now. Two driver complaints in the first month.', at: '2026-02-20' }],
    },
    {
      id: 'PILL-0015', title: 'HVAC electrical check before a start-up change', domain: 'Technical Services', system: 'HVAC · electrical',
      summary: 'Inspect the chiller power board and starters before changing how or when the chillers start.',
      tags: ['hvac-electrical'], checkFor: ['hvac-chiller', 'electrical-sb1'],
      owner: { name: 'Rahman bin Ismail', title: 'Senior Technician', site: 'Tower B' },
      steps: [
        'Check the condition of the equipment: starters, contactors and breakers on the chiller power board. Look for heat marks, smell and noise.',
        'Look for exposed wires. Re-arrange, sleeve and terminate them before the new sequence runs.',
        'Test with a multimeter: phase voltages at each starter, and continuity of the control circuit.',
      ],
      guardrails: [
        'Isolate and lock off before touching any conductor.',
        'Exposed live conductors: stop and escalate to Technical Services.',
      ],
      tools: ['Multimeter', 'Lock-out kit'],
      sites: ['Tower B', 'DC-1'], status: 'live',
      revisions: [{ rev: 1, date: '2026-06-08', by: 'Rahman bin Ismail', note: 'First issue at Tower B.' }],
      ratings: [{ rating: 4, by: 'Priya Nair', reason: 'Found a loose neutral at Tower B before the first sequence change.', at: '2026-06-30' }],
    },
    {
      id: 'PILL-0004', title: 'Warm-floor complaint triage', domain: 'Tenant Experience', system: 'HVAC · air side',
      summary: 'Sort warm-floor complaints into air-side, plant-side and tenant-side causes before anyone touches a setpoint.',
      tags: ['tenant-comfort', 'hvac-air'],
      owner: { name: 'Siti Aminah', title: 'Tenant Services Lead', site: 'Tower B' },
      steps: [
        'Read the floor temperature and the AHU discharge temperature at the same time.',
        'If discharge air is warm, call the plant room. If it is cool, check the floor dampers.',
        'Reply to the tenant within 30 minutes with what was found.',
      ],
      guardrails: ['Do not change a setpoint to answer a single complaint.'],
      tools: ['BMS trend view', 'Handheld thermometer'],
      sites: ['Tower B'], status: 'live',
      revisions: [{ rev: 1, date: '2025-08-21', by: 'Siti Aminah', note: 'First issue at Tower B.' }],
      ratings: [{ rating: 4, by: 'Priya Nair', reason: 'Complaint replies within 30 minutes went from 40% to 85%.', at: '2025-10-02' }],
    },
    {
      id: 'PILL-0009', title: 'Cooling tower fans on wet-bulb', domain: 'Energy', system: 'HVAC · heat rejection',
      summary: 'Run cooling tower fans to the outdoor wet-bulb temperature instead of a fixed schedule.',
      tags: ['hvac-heat-rejection'],
      owner: { name: 'Lim Boon Huat', title: 'Plant Supervisor', site: 'Tower B' },
      steps: [
        'Read outdoor wet-bulb from the weather station every 15 minutes.',
        'Hold the condenser water approach at 3 °C above wet-bulb.',
      ],
      guardrails: ['Fall back to the fixed schedule if the weather station goes offline.'],
      tools: ['BMS weather station'],
      sites: ['Tower B'], status: 'live',
      revisions: [{ rev: 1, date: '2025-05-14', by: 'Lim Boon Huat', note: 'First issue at Tower B.' }],
      ratings: [{ rating: 3, by: 'Priya Nair', reason: 'Saves energy, but the weather station drops out in heavy rain.', at: '2025-09-11' }],
    },
  ];
}

export type MatchRole = 'measure' | 'check' | 'related' | 'none';
export interface PillMatch { pill: Pill; role: MatchRole; reason: string }

/** The agent's library search: which existing pills carry, guard or relate to this selection. */
export function searchLibrary(measures: readonly string[], pills: Pill[]): PillMatch[] {
  const tags = new Set(measures.flatMap((m) => measureById(m)?.tags ?? []));
  const rank: Record<MatchRole, number> = { measure: 0, check: 1, related: 2, none: 3 };
  return pills
    .filter((p) => !p.caseId)
    .map((pill): PillMatch => {
      if (pill.measureId && measures.includes(pill.measureId)) {
        return { pill, role: 'measure', reason: `Approved at ${pill.sites.join(', ')}. Carries “${measureById(pill.measureId)?.title}”.` };
      }
      if (pill.checkFor?.some((t) => tags.has(t))) {
        return { pill, role: 'check', reason: 'This solution changes how the chillers start on SB-1, so this check runs first.' };
      }
      if (pill.tags.some((t) => tags.has(t))) {
        return { pill, role: 'related', reason: `Shares the ${pill.system} system. Useful if tenants report warm floors.` };
      }
      return { pill, role: 'none', reason: 'Different system. Not used.' };
    })
    .sort((a, b) => rank[a.role] - rank[b.role]);
}

// ---------- cases ----------

export type CaseStatus = 'drafting' | 'submitted' | 'returned' | 'approved' | 'live';

export interface AgentRun {
  at: string;
  runs: number;
  /** The problem text the agent last read, so a changed description triggers a fresh search. */
  problem: string;
  mentioned: Partial<Record<MeasureId, string>>;
  added: { id: MeasureId; reason: string }[];
  clear: boolean;
}
export interface Evidence {
  at: string;
  revision: number;
  measures: MeasureId[];
  tuning: Tuning;
  baselinePeakKw: number;
  peakKw: number;
  totalKwh: number;
  costUsd: number;
  comfortHoursAtRisk: number;
  maxBoardPct: number;
  authority: 'approve' | 'escalate';
  verdicts: Verdict[];
}
export interface Decision { revision: number; decision: 'approved' | 'returned'; reason: string; rating?: number; by: string; at: string }

export interface Case {
  id: string;
  title: string;
  asset: string;
  engineerId: string;
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  problem: string;
  agent: AgentRun | null;
  measures: MeasureId[];
  /** Settings the engineer changed through comments, on top of the pill defaults. */
  tuning: Tuning;
  /** Measures the engineer proposed through a comment ("Added by me"). */
  own: MeasureId[];
  comments: CommentEntry[];
  simRuns: number;
  answers: Record<string, string>;
  confirmed: boolean;
  revision: number;
  issues: { revision: number; at: string }[];
  evidence: Evidence | null;
  decisions: Decision[];
  pillId: string | null;
  liveAt: string | null;
}

export function newCase(id: string, engineerId: string, now: string): Case {
  return {
    id, title: `${TOWER.name} morning demand spike`, asset: TOWER.name, engineerId, createdAt: now, updatedAt: now,
    status: 'drafting', problem: SAMPLE_PROBLEM, agent: null, measures: [], tuning: {}, own: [], comments: [], simRuns: 0, answers: {}, confirmed: false,
    revision: 0, issues: [], evidence: null, decisions: [], pillId: null, liveAt: null,
  };
}

export function evidenceFor(measures: MeasureId[], tuning: Tuning, revision: number, at: string): Evidence {
  const base = baseline();
  const fix = simulateMeasures(measures, settingsFor(tuning));
  const review = reviewAgents(base, fix);
  return {
    at, revision, measures: [...measures], tuning: { ...tuning },
    baselinePeakKw: Math.round(base.peakKw), peakKw: Math.round(fix.peakKw),
    totalKwh: Math.round(fix.totalKwh), costUsd: Math.round(fix.costUsd), comfortHoursAtRisk: fix.comfortHoursAtRisk,
    maxBoardPct: Math.round(Math.max(...Object.values(fix.maxBoardPct))),
    authority: review.authority, verdicts: review.comments.map((c) => c.verdict),
  };
}

export const isEscalated = (measures: readonly string[], tuning: Tuning = {}) =>
  reviewAgents(baseline(), simulateMeasures(measures, settingsFor(tuning))).authority === 'escalate';

// ---------- the governed workflow ----------

export class FlowError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

export type Action =
  | { type: 'update'; problem?: string; measures?: string[]; answers?: Record<string, string>; confirmed?: boolean }
  | { type: 'runAgent' }
  | { type: 'replan' }
  | { type: 'comment'; text: string; reading?: Reading }
  | { type: 'undoComment'; id: string }
  | { type: 'submit' }
  | { type: 'redo' }
  | { type: 'approve'; reason: string; rating: number }
  | { type: 'return'; reason: string }
  | { type: 'execute' };

/** Who may do what. Checked on the server for every mutating request. */
export const PERMISSIONS: Record<Action['type'], Role> = {
  update: 'engineer', runAgent: 'engineer', replan: 'engineer', comment: 'engineer', undoComment: 'engineer', submit: 'engineer', redo: 'engineer',
  approve: 'manager', return: 'manager', execute: 'manager',
};

const STATUS_WORD: Record<CaseStatus, string> = {
  drafting: 'being drafted', submitted: 'with the manager', returned: 'returned for changes', approved: 'approved', live: 'live',
};

function need(c: Case, status: CaseStatus) {
  if (c.status !== status) throw new FlowError(`That step isn't available while the case is ${STATUS_WORD[c.status]}.`);
}

function cleanMeasures(ms: unknown): MeasureId[] {
  if (!Array.isArray(ms) || ms.some((m) => !MEASURE_IDS.includes(m))) throw new FlowError('Unknown measure.', 400);
  return MEASURE_IDS.filter((m) => ms.includes(m));
}

function text(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new FlowError(`${field} must be text.`, 400);
  if (v.length > max) throw new FlowError(`${field} is too long (max ${max} characters).`, 400);
  return v;
}

export interface Applied { case: Case; pill?: Pill; detail: string }

export function applyAction(c: Case, action: Action, actor: User, now: string, pills: Pill[]): Applied {
  const role = PERMISSIONS[action.type];
  if (!role) throw new FlowError('Unknown action.', 400);
  if (actor.role !== role) throw new FlowError(`Only the ${role === 'engineer' ? 'engineer' : 'Asset Operations Manager'} can do that.`, 403);
  if (role === 'engineer' && c.engineerId !== actor.id) throw new FlowError('This case belongs to another engineer.', 403);
  const next: Case = { ...c, updatedAt: now };

  switch (action.type) {
    case 'update': {
      need(c, 'drafting');
      const changed: string[] = [];
      if (action.problem !== undefined) { next.problem = text(action.problem, 2000, 'Problem'); changed.push('problem'); }
      if (action.measures !== undefined) {
        next.measures = cleanMeasures(action.measures);
        if (next.measures.join() !== c.measures.join()) next.simRuns = c.simRuns + 1;
        changed.push('measures');
      }
      if (action.answers !== undefined) {
        const answers: Record<string, string> = {};
        for (const [k, v] of Object.entries(action.answers ?? {})) answers[text(k, 60, 'Question id')] = text(v, 1000, 'Answer');
        next.answers = answers;
        changed.push('answers');
      }
      if (action.confirmed !== undefined) { next.confirmed = action.confirmed === true; changed.push('confirmation'); }
      return { case: next, detail: `Updated ${changed.join(', ') || 'nothing'}.` };
    }
    case 'runAgent': {
      need(c, 'drafting');
      if (!c.problem.trim()) throw new FlowError('Describe the problem first.', 400);
      const mentioned = detectMentions(c.problem);
      const rec = recommend(Object.keys(mentioned) as MeasureId[], settingsFor(c.tuning));
      next.agent = { at: now, runs: (c.agent?.runs ?? 0) + 1, problem: c.problem, mentioned, added: rec.added, clear: rec.clear };
      next.measures = rec.measures;
      next.simRuns = c.simRuns + 1;
      next.confirmed = false;
      const used = searchLibrary(rec.measures, pills).filter((m) => m.role === 'measure' || m.role === 'check');
      return { case: next, detail: `Agent searched ${pills.filter((p) => !p.caseId).length} pills and the playbook. Proposed ${rec.measures.length} measures using ${used.map((m) => m.pill.id).join(', ') || 'no existing pills'}.` };
    }
    case 'replan': {
      need(c, 'drafting');
      if (!c.agent) throw new FlowError('Ask the agent for a first proposal before re-planning.');
      const rec = recommend(c.measures, settingsFor(c.tuning));
      next.agent = { ...c.agent, at: now, runs: c.agent.runs + 1, added: [...c.agent.added.filter((a) => rec.measures.includes(a.id)), ...rec.added], clear: rec.clear };
      next.measures = rec.measures;
      next.simRuns = c.simRuns + 1;
      next.confirmed = false;
      return { case: next, detail: rec.added.length ? `Agent re-planned and added ${rec.added.map((a) => a.id).join(', ')}.` : 'Agent re-planned. Nothing to add.' };
    }
    case 'comment': {
      need(c, 'drafting');
      const text = typeof action.text === 'string' ? action.text.trim() : '';
      if (!text) throw new FlowError('Write a comment for the agent first.', 400);
      if (text.length > 1000) throw new FlowError('Keep the comment under 1,000 characters.', 400);
      if (!action.reading) throw new FlowError('The agent has not read this comment yet.', 400);
      const before = { measures: c.measures, tuning: c.tuning };
      const out = applyReading(before, action.reading);
      // A measure nobody had proposed joins the list unticked, tagged "Added by me", so the engineer ticks it to see its effect.
      const listed = new Set<string>([...c.measures, ...c.own, ...Object.keys(c.agent?.mentioned ?? {}), ...(c.agent?.added ?? []).map((a) => a.id)]);
      const proposed = out.plan.measures.filter((m) => !listed.has(m));
      const after = { measures: out.plan.measures.filter((m) => !proposed.includes(m)), tuning: out.plan.tuning };
      const applied = out.applied.map((a) => (a.measure && proposed.includes(a.measure) ? { ...a, from: 'Not proposed', to: 'Added by me, tick to include' } : a));
      const titles = proposed.map((m) => `“${measureById(m)!.title}”`).join(' and ');
      const entry: CommentEntry = {
        id: `C${c.comments.length + 1}-${now.slice(11, 19).replace(/:/g, '')}`,
        at: now, text, reader: action.reading.reader, fallbackReason: action.reading.fallbackReason,
        reply: proposed.length
          ? `I added ${titles} to the proposed solution with your settings. Tick it to see what it does to the load.`
          : action.reading.reply || defaultReply(applied, action.reading.notes, out.ignored),
        applied, ...(proposed.length && { proposed }), notes: action.reading.notes, ignored: out.ignored, before, after,
      };
      next.measures = after.measures;
      next.tuning = after.tuning;
      next.own = [...c.own, ...proposed];
      next.comments = [...c.comments, entry];
      if (applied.length) { next.simRuns = c.simRuns + 1; next.confirmed = false; }
      const by = action.reading.reader === 'gemini' ? 'Gemini' : 'the offline rules';
      return { case: next, detail: `Agent (${by}) read a comment: ${out.applied.length ? out.applied.map((a) => `${a.label} ${a.from} → ${a.to}`).join('; ') : 'no change'}${entry.notes.length ? `; kept ${entry.notes.length} note(s)` : ''}.` };
    }
    case 'undoComment': {
      need(c, 'drafting');
      const last = c.comments.at(-1);
      if (!last || last.id !== action.id) throw new FlowError('Only the latest comment can be undone.');
      if (!samePlan({ measures: c.measures, tuning: c.tuning }, last.after)) {
        throw new FlowError("The plan has changed since that comment, so it can't be undone automatically. Untick or re-comment instead.");
      }
      next.measures = last.before.measures;
      next.tuning = last.before.tuning;
      next.own = c.own.filter((m) => !last.proposed?.includes(m));
      next.comments = c.comments.slice(0, -1);
      next.simRuns = c.simRuns + 1;
      next.confirmed = false;
      return { case: next, detail: `Undid the comment “${last.text.slice(0, 80)}”.` };
    }
    case 'submit': {
      need(c, 'drafting');
      if (!c.agent) throw new FlowError('Ask the agent for a proposal before sending.');
      if (c.measures.length === 0) throw new FlowError('Pick at least one measure before sending.', 400);
      if (!c.confirmed) throw new FlowError('Confirm the pill before sending it to the manager.', 400);
      next.revision = c.revision + 1;
      next.evidence = evidenceFor(c.measures, c.tuning, next.revision, now);
      next.issues = [...c.issues, { revision: next.revision, at: now }];
      next.status = 'submitted';
      return { case: next, detail: `Issued revision ${next.revision} for approval. Server re-simulation: peak ${fmtKw(next.evidence.baselinePeakKw)} → ${fmtKw(next.evidence.peakKw)}.` };
    }
    case 'redo': {
      need(c, 'returned');
      next.status = 'drafting';
      next.confirmed = false;
      return { case: next, detail: 'Engineer reopened the case to address the comments.' };
    }
    case 'approve': {
      need(c, 'submitted');
      const reason = text(action.reason, 1000, 'Reason').trim();
      if (!reason) throw new FlowError('A reason is required.', 400);
      const rating = action.rating;
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new FlowError('Rate the pill from 1 to 5 stars.', 400);
      if (isEscalated(c.measures, c.tuning)) {
        throw new FlowError(`Escalated to the ${ESCALATION_ROLE}: a power board goes over its rating, so this pill can't be approved here.`, 403);
      }
      const decision: Decision = { revision: c.revision, decision: 'approved', reason, rating, by: actor.name, at: now };
      next.decisions = [...c.decisions, decision];
      next.status = 'approved';
      const pill = pillFromCase(next, decision, pills);
      next.pillId = pill.id;
      return { case: next, pill, detail: `Approved revision ${c.revision} with ${rating} stars as ${pill.id}.` };
    }
    case 'return': {
      need(c, 'submitted');
      const reason = text(action.reason, 1000, 'Comments').trim();
      if (!reason) throw new FlowError('Write comments so the engineer knows what to change.', 400);
      next.decisions = [...c.decisions, { revision: c.revision, decision: 'returned', reason, by: actor.name, at: now }];
      next.status = 'returned';
      return { case: next, detail: `Returned revision ${c.revision} with comments.` };
    }
    case 'execute': {
      need(c, 'approved');
      next.status = 'live';
      next.liveAt = now;
      const existing = pills.find((p) => p.id === c.pillId);
      if (!existing) throw new FlowError('The approved pill is missing from the library.', 500);
      const pill: Pill = { ...existing, status: 'live', sites: [...new Set([...existing.sites, c.asset])] };
      return { case: next, pill, detail: `${pill.id} is live at ${c.asset} from the next weekday start-up.` };
    }
  }
}

export function nextPillId(pills: Pill[]) {
  const n = Math.max(0, ...pills.map((p) => Number(p.id.slice(5)) || 0)) + 1;
  return `PILL-${String(n).padStart(4, '0')}`;
}

function pillFromCase(c: Case, d: Decision, pills: Pill[]): Pill {
  const existing = pills.find((p) => p.id === c.pillId);
  const engineer = userById(c.engineerId);
  const ms = c.measures.map((m) => measureById(m)!);
  const matches = searchLibrary(c.measures, pills);
  const settings = settingsFor(c.tuning);
  const fix = simulateMeasures(c.measures, settings);
  const questions = questionsFor(c.measures, fix, baseline(), settings);
  const knowHow = [
    ...questions.filter((q) => c.answers[q.id]?.trim()).map((q) => ({ question: q.question, answer: c.answers[q.id].trim() })),
    ...c.comments.map((x) => ({
      question: 'Engineer\u2019s comment to the agent',
      answer: x.text + (x.applied.length ? ` (Changed: ${x.applied.map((a) => `${a.label} ${a.from} → ${a.to}`).join('; ')}.)` : ''),
    })),
  ];
  const date = d.at.slice(0, 10);
  return {
    id: existing?.id ?? nextPillId(pills),
    title: PILL_NAME,
    summary: `Keeps ${c.asset} under its ${fmtKw(TOWER.contractedCapacityKw)} cap at the weekday start-up: peak ${fmtKw(c.evidence?.baselinePeakKw ?? 0)} → ${fmtKw(c.evidence?.peakKw ?? 0)} in simulation.`,
    domain: 'Energy',
    system: [...new Set(ms.map((m) => systemName(m.tags[0])))].join(', '),
    tags: [...new Set(ms.flatMap((m) => m.tags))],
    owner: { name: engineer?.name ?? c.engineerId, title: engineer?.title ?? 'Engineer', site: c.asset },
    steps: ms.map((m) => `${m.title}. ${m.simChange(settings)}`),
    guardrails: [
      `Any power board over its rating escalates to the ${ESCALATION_ROLE}.`,
      ...(c.answers['general-conditions']?.trim() ? [c.answers['general-conditions'].trim()] : []),
    ],
    tools: ['BMS schedules', ...(c.measures.includes('evShift') ? ['Charger load manager'] : [])],
    knowHow,
    composedOf: matches.filter((m) => m.role === 'measure').map((m) => m.pill.id),
    checks: matches.filter((m) => m.role === 'check').map((m) => m.pill.id),
    sites: existing?.sites ?? [],
    status: existing?.status === 'live' ? 'live' : 'approved',
    revisions: [...(existing?.revisions ?? []), { rev: c.revision, date, by: engineer?.name ?? '', note: c.revision === 1 ? `First issue at ${c.asset}.` : 'Revised after review comments.' }],
    ratings: [...(existing?.ratings ?? []), { rating: d.rating ?? 0, by: d.by, reason: d.reason, at: date }],
    caseId: c.id,
  };
}

const SYSTEM_NAMES: Record<string, string> = {
  'hvac-chiller': 'HVAC · chiller plant', 'hvac-schedule': 'HVAC · schedules', 'hvac-air': 'HVAC · air side',
  'electrical-sb1': 'Electrical · SB-1', 'electrical-sb4': 'Electrical · SB-4', 'ev-charging': 'EV charging',
  'tenant-comfort': 'Tenant comfort', 'hvac-electrical': 'HVAC · electrical', 'hvac-heat-rejection': 'HVAC · heat rejection',
};
export const systemName = (tag: string) => SYSTEM_NAMES[tag] ?? tag;

/** A case already issued for review, for "load a sample" in the manager's empty queue. */
export function sampleCase(id: string, now: string, pills: Pill[]): Case {
  const engineer = USERS.find((u) => u.role === 'engineer')!;
  let c = newCase(id, engineer.id, now);
  c = applyAction(c, { type: 'runAgent' }, engineer, now, pills).case;
  c = { ...c, answers: { ...SAMPLE_ANSWERS }, confirmed: true };
  return applyAction(c, { type: 'submit' }, engineer, now, pills).case;
}

export interface AuditEvent { seq: number; at: string; actor: string; role: Role | 'system'; action: string; target: string; detail: string }

export interface AppState { version: number; cases: Case[]; pills: Pill[]; audit: AuditEvent[] }
