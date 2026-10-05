// Pieces of a case that both the engineer and the manager read.
import { useMemo, type ReactNode } from 'react';
import { health, searchLibrary, userById, type Case, type Pill } from '../../shared/flow.ts';
import {
  actionsFor, baseline, BOARD_NAMES, BOARDS, boardStatus, CHILLER, checkSelection, diagnose, fmtKw, fmtTime, LOADS,
  MEASURES, measureById, PILL_NAME, PILL_SETTINGS, questionsFor, reviewAgents, SCHEDULE, STEP_H, TARIFF,
  TODAY_SETTINGS, TOWER, simulateMeasures, ARRIVAL, settingsFor, TUNING_IDS, TUNING_FIELDS, describeValue, currentValue,
  type Actions, type MeasureId, type SimResult, type Tuning,
} from '../../shared/model.ts';
import { Timeline } from './drawings.tsx';
import { Explained, Icon, Stars, TitleBlock, VerdictMark, when } from './ui.tsx';

/** Everything the screens derive from a case's measures, computed once per change. */
export function useCaseModel(c: Case, pills: Pill[]) {
  return useMemo(() => {
    const base = baseline();
    const settings = settingsFor(c.tuning);
    const fix = simulateMeasures(c.measures, settings);
    return {
      base, fix, settings,
      diagnosis: diagnose(base),
      notes: checkSelection(c.measures, fix, base, settings),
      questions: questionsFor(c.measures, fix, base, settings),
      review: reviewAgents(base, fix),
      matches: searchLibrary(c.measures, pills),
    };
  }, [c.measures, c.tuning, pills]);
}
export type CaseModel = ReturnType<typeof useCaseModel>;

const kw = (n: number) => Math.round(n).toLocaleString('en-SG');
const worst = (r: SimResult) => BOARDS.reduce((a, b) => (r.maxBoardPct[a] >= r.maxBoardPct[b] ? a : b));

/** Today vs proposal as a drawing schedule: one row per measure of success. */
export function ImpactSchedule({ base, fix, withCost = false }: { base: SimResult; fix: SimResult; withCost?: boolean }) {
  const wb = worst(fix);
  const rows: { name: ReactNode; today: string; pill: string; delta: number; unit: string; better: boolean }[] = [
    { name: 'Peak demand', today: `${kw(base.peakKw)} kW at ${fmtTime(base.peakAtHour)}`, pill: `${kw(fix.peakKw)} kW at ${fmtTime(fix.peakAtHour)}`, delta: fix.peakKw - base.peakKw, unit: ' kW', better: fix.peakKw <= base.peakKw },
    { name: <>Busiest power board <span className="muted">({BOARD_NAMES[wb].replace(/ \(.*\)/, '')})</span></>, today: `${Math.round(base.maxBoardPct[wb])}%`, pill: `${Math.round(fix.maxBoardPct[wb])}% · ${boardStatus(fix.maxBoardPct[wb]) === 'ok' ? 'OK' : boardStatus(fix.maxBoardPct[wb]) === 'warning' ? 'above 90%' : 'over rating'}`, delta: fix.maxBoardPct[wb] - base.maxBoardPct[wb], unit: ' pts', better: fix.maxBoardPct[wb] <= base.maxBoardPct[wb] },
    { name: 'Hours floors may be too warm', today: String(base.comfortHoursAtRisk), pill: String(fix.comfortHoursAtRisk), delta: fix.comfortHoursAtRisk - base.comfortHoursAtRisk, unit: ' h', better: fix.comfortHoursAtRisk <= base.comfortHoursAtRisk },
    { name: 'Energy per day', today: `${kw(base.totalKwh)} kWh`, pill: `${kw(fix.totalKwh)} kWh`, delta: fix.totalKwh - base.totalKwh, unit: ' kWh', better: fix.totalKwh <= base.totalKwh },
    ...(withCost ? [{ name: <>Cost per day <span className="muted">(placeholder tariff)</span></>, today: `$${kw(base.costUsd)}`, pill: `$${kw(fix.costUsd)}`, delta: fix.costUsd - base.costUsd, unit: '', better: fix.costUsd <= base.costUsd }] : []),
  ];
  return (
    <div className="scroll-x">
    <table className="schedule">
      <caption className="sr-only">Today against the proposal</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">Proposal</th><th scope="col">Change</th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const zero = Math.abs(r.delta) < 0.5;
          const d = `${r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}${r.unit === '' ? '$' : ''}${kw(Math.abs(r.delta))}${r.unit}`;
          return (
            <tr key={i}>
              <th scope="row">{r.name}</th>
              <td>{r.today}</td>
              <td><strong>{r.pill}</strong></td>
              <td className={zero ? 'delta' : r.better ? 'delta delta--good' : 'delta delta--bad'}>
                {zero ? 'No change' : <>{d} <span className="delta-word">{r.better ? 'better' : 'worse'}</span></>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

export function AgentVerdicts({ review }: { review: CaseModel['review'] }) {
  return (
    <ul className="verdicts">
      {review.comments.map((c) => (
        <li key={c.agent} className={`verdict-row verdict-row--${c.verdict}`}>
          <div className="verdict-head">
            <strong>{c.agent} agent</strong>
            <VerdictMark verdict={c.verdict} />
          </div>
          <ul className="verdict-points">
            {c.points.map((p, i) => <li key={i}><Explained text={p} /></li>)}
          </ul>
          <div className="verdict-cites">Cites {c.cites.map((x) => <code key={x}>{x}</code>)}</div>
        </li>
      ))}
    </ul>
  );
}

/** Where each measure comes from: an approved pill, or the domain playbook. */
export function sourceOf(id: string, pills: Pill[]) {
  const pill = pills.find((p) => p.measureId === id && !p.caseId);
  const m = measureById(id)!;
  return pill
    ? { kind: 'pill' as const, pill, text: `${pill.id} · ${pill.owner.site}` }
    : { kind: 'playbook' as const, text: m.kind === 'industry' ? 'Playbook · industry practice' : 'Playbook · from another field' };
}

export function SourceTag({ id, pills }: { id: string; pills: Pill[] }) {
  const s = sourceOf(id, pills);
  return s.kind === 'pill'
    ? <span className="source source--pill" title={`Existing pill by ${s.pill.owner.name}`}><Icon name="doc" size={14} />{s.text}<Stars value={health(s.pill)} /></span>
    : <span className="source source--playbook"><Icon name="search" size={14} />{s.text}</span>;
}

/** Settings an engineer's comment changed for this measure, against the pill default. */
export function TunedSettings({ measure, tuning }: { measure: MeasureId; tuning: Tuning }) {
  const fields = TUNING_IDS.filter((f) => TUNING_FIELDS[f].measure === measure && tuning[f] !== undefined);
  if (!fields.length) return null;
  const defaults = settingsFor({});
  return (
    <ul className="tuned" aria-label="Settings changed by your comments">
      {fields.map((f) => (
        <li key={f}>
          <span className="tuned-label">{TUNING_FIELDS[f].label}</span> <strong>{describeValue(f, tuning[f]!)}</strong>
          <span className="muted"> · default {describeValue(f, currentValue(f, defaults))}</span>
        </li>
      ))}
    </ul>
  );
}

export function CheckPill({ pill }: { pill: Pill }) {
  return (
    <article className="check-pill">
      <header>
        <span className="check-pill-id">{pill.id}</span>
        <strong>{pill.title}</strong>
        <Stars value={health(pill)} />
      </header>
      <ol className="check-steps">{pill.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="check-meta"><Icon name="tool" size={14} /> {pill.tools.join(', ')} · by {pill.owner.name}, {pill.owner.title}, {pill.owner.site}</p>
    </article>
  );
}

/** The pill as an issued drawing sheet. */
export function PillDrawing({ c, model, pills }: { c: Case; model: CaseModel; pills: Pill[] }) {
  const chosen = MEASURES.filter((m) => c.measures.includes(m.id));
  const checks = model.matches.filter((m) => m.role === 'check');
  const answered = model.questions.filter((q) => c.answers[q.id]?.trim()).length;
  return (
    <article className="pill-sheet">
      <header className="pill-sheet-head">
        <h3>{PILL_NAME}</h3>
        <p className="muted">{c.asset} · Energy optimisation · drafted by {userById(c.engineerId)?.name}</p>
      </header>
      <div className="pill-sheet-grid">
        <section>
          <h4>Problem, in the engineer's words</h4>
          <blockquote className="quote">{c.problem || 'No description.'}</blockquote>
        </section>
        <section>
          <h4>Measures</h4>
          {chosen.length ? (
            <ul className="measure-list">
              {chosen.map((m) => <li key={m.id}><strong>{m.title}</strong>{c.own.includes(m.id) && <span className="origin origin--own">Added by the engineer</span>}<SourceTag id={m.id} pills={pills} /><TunedSettings measure={m.id} tuning={c.tuning} /></li>)}
            </ul>
          ) : <p className="muted">No measures selected yet.</p>}
        </section>
      </div>
      {chosen.length > 0 && <Timeline today={actionsFor([])} pill={actionsFor(c.measures, model.settings)} />}
      {checks.length > 0 && (
        <section>
          <h4>Required before execution</h4>
          {checks.map((m) => <CheckPill key={m.pill.id} pill={m.pill} />)}
        </section>
      )}
      <section>
        <h4>Captured know-how <span className="muted">({answered} of {model.questions.length} questions answered)</span></h4>
        <dl className="knowhow">
          {model.questions.map((q) => (
            <div key={q.id} className="knowhow-row">
              <dt><span className={`perspective perspective--${q.perspective.split(' ')[0].toLowerCase()}`}>{q.perspective}</span>{q.question}</dt>
              <dd className={c.answers[q.id]?.trim() ? '' : 'skipped'}>{c.answers[q.id]?.trim() || 'Skipped by the engineer.'}</dd>
            </div>
          ))}
        </dl>
      </section>
      {chosen.length > 0 && (
        <section>
          <h4>Known trade-offs</h4>
          <ul className="tradeoffs">{chosen.map((m) => <li key={m.id}>{m.tradeoff(model.settings)}</li>)}</ul>
        </section>
      )}
      {c.comments.length > 0 && (
        <section>
          <h4>Engineer's comments to the agent</h4>
          <ul className="sheet-comments">
            {c.comments.map((x) => (
              <li key={x.id}>
                <blockquote className="quote">{x.text}</blockquote>
                {x.applied.length > 0 && <p><span className="label">Changed</span> {x.applied.map((a) => `${a.label} ${a.from} → ${a.to}`).join('; ')}</p>}
                {x.notes.length > 0 && <p><span className="label">Notes</span> {x.notes.join(' ')}</p>}
                <p className="muted">Read by {x.reader === 'gemini' ? 'Gemini' : 'the offline rules'}, {when(x.at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export function RevisionTable({ c }: { c: Case }) {
  const rows = [
    ...c.issues.map((x) => ({ rev: x.revision, at: x.at, text: 'Issued for approval', by: userById(c.engineerId)?.name ?? '' })),
    ...c.decisions.map((d) => ({ rev: d.revision, at: d.at, text: d.decision === 'approved' ? `Approved${d.rating ? ` · ${d.rating}/5` : ''}: ${d.reason}` : `Returned: ${d.reason}`, by: d.by })),
    ...(c.liveAt ? [{ rev: c.revision, at: c.liveAt, text: `Executed. Live at ${c.asset}.`, by: c.decisions.at(-1)?.by ?? '' }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (!rows.length) return null;
  return (
    <table className="rev-table">
      <caption>Revisions</caption>
      <thead><tr><th scope="col">Rev</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">By</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{r.rev}</td><td>{when(r.at)}</td><td>{r.text}</td><td>{r.by}</td></tr>)}</tbody>
    </table>
  );
}

// ---------- how the simulation works (for anyone who asks "where do these numbers come from?") ----------

const pct = (f: number) => `${Math.round(f * 100)}%`;
const span = ([a, b]: [number, number]) => `${fmtTime(a)}–${fmtTime(b)}`;
const SETTINGS = ['Cooling plant and AHUs start', 'Chiller start times', 'Start-up surge', 'Chiller holding load after pull-down', 'Morning setpoint', 'AHU start by floor group', 'EV charging', 'Chillers and AHUs off'];
function settings(a: Actions) {
  return [
    fmtTime(a.plantStart), a.chillerStarts.map(fmtTime).join(', '), `${a.inrushMult.toFixed(2)}× for ${CHILLER.inrushMin} min`,
    `${pct(a.holdingFrac)} of full load`,
    a.setpoint ? `+${a.setpoint.offsetC}°C, ${span(a.setpoint.window)} (× ${a.setpoint.factor})` : 'Unchanged',
    `${fmtTime(a.ahuStarts[0])} / ${fmtTime(a.ahuStarts[1])}`,
    a.ev.mode === 'managed' ? `${span([a.ev.start, a.ev.end])}, max ${a.ev.chargers} chargers` : `On arrival from ${fmtTime(SCHEDULE.evArrival.start)}, up to ${LOADS.evChargers}`,
    fmtTime(SCHEDULE.hvacStop),
  ];
}

export function Method({ base, fix }: { base: SimResult; fix: SimResult }) {
  const a = settings(base.actions);
  const b = settings(fix.actions);
  const changedCount = SETTINGS.filter((_, i) => a[i] !== b[i]).length;
  const loads: [string, string, string][] = [
    ['Chiller plant', fmtKw(LOADS.chillerKw), `Ramp ${CHILLER.rampMin} min, surge ${CHILLER.inrushMin} min, settle over ${CHILLER.decayMin} min`],
    ['AHUs', fmtKw(LOADS.ahuKw), `Ramp ${SCHEDULE.ahuRampMin} min from start`],
    ['Lighting', fmtKw(LOADS.lightsKw), `On ${span(SCHEDULE.lightsOn)}, ${pct(SCHEDULE.lightsStandbyFrac)} otherwise`],
    ['Tenant plug loads', fmtKw(LOADS.plugKw), `Ramp ${span(SCHEDULE.plugRamp)}, ${pct(SCHEDULE.plugAfterHoursFrac)} after ${fmtTime(SCHEDULE.plugOff)}`],
    ['Lifts', fmtKw(LOADS.liftsKw), `100% ${span(SCHEDULE.liftsRush)}, ${pct(SCHEDULE.liftsLunchFrac)} at lunch, ${pct(SCHEDULE.liftsIdleFrac)} otherwise`],
    ['Car park fans', fmtKw(LOADS.carparkKw), `${pct(SCHEDULE.carparkOnFrac)} ${span(SCHEDULE.carparkOn)}, ${pct(SCHEDULE.carparkOffFrac)} otherwise`],
    ['EV chargers', fmtKw(LOADS.evChargers * LOADS.evChargerKw), 'Per schedule'],
    ['Always-on base', fmtKw(LOADS.baseKw), 'Constant'],
  ];
  return (
    <div className="method">
      <p>One synthetic weekday in 96 steps of {STEP_H * 60} minutes. The same model runs twice, on today's schedule and on the pill's. Only the schedule changes.</p>
      <p>
        <strong>Model type: a piecewise-linear electrical demand schedule, not a thermal model.</strong> Each load has its own
        time-of-day profile built from straight-line ramps and fixed fractions. There is no heat-balance equation, thermal mass or
        weather behind it. It is the kind of load-duration curve used to size switchboards and check demand charges.
      </p>
      <p>
        Each chiller ramps 0 → 100% of its share of {fmtKw(LOADS.chillerKw)} over {CHILLER.rampMin} minutes, then eases down to its
        holding load over {CHILLER.decayMin} minutes. For the first {CHILLER.inrushMin} minutes after a start, its draw is multiplied by
        the start-up surge factor (today {TODAY_SETTINGS.inrushMult.toFixed(2)}×, soft-start {PILL_SETTINGS.softStartInrush.toFixed(2)}×).
        Comfort is a rule of thumb: a floor group counts as ready once its AHUs and two chillers have run for an hour.
      </p>
      <h4>Assumptions to know</h4>
      <ul>
        <li>Synthetic data, not calibrated against {TOWER.name}'s meters.</li>
        <li>Pre-cooling and setpoint savings are assumed: holding load {pct(TODAY_SETTINGS.holdingFrac)} → {pct(PILL_SETTINGS.precoolHoldingFrac)}, × {fix.actions.setpoint?.factor ?? PILL_SETTINGS.setpoint.factor} in the setpoint window (+0.5°C = × 0.84; each further degree × 0.32 less).</li>
        <li>Floor temperatures are not simulated. Occupied hours are {span(ARRIVAL)}.</li>
      </ul>
      <h4>Exact settings <span className="muted">({changedCount} of {SETTINGS.length} changed)</span></h4>
      <div className="scroll-x">
        <table className="schedule schedule--compact">
          <thead><tr><th scope="col">Setting</th><th scope="col">Today</th><th scope="col">With the pill</th></tr></thead>
          <tbody>{SETTINGS.map((s, i) => <tr key={s} className={a[i] !== b[i] ? 'row-changed' : ''}><th scope="row">{s}</th><td>{a[i]}</td><td>{b[i]}{a[i] !== b[i] && <span className="sr-only"> (changed)</span>}</td></tr>)}</tbody>
        </table>
      </div>
      <h4>Load patterns</h4>
      <div className="scroll-x">
        <table className="schedule schedule--compact">
          <thead><tr><th scope="col">Load</th><th scope="col">Full load</th><th scope="col">Pattern</th></tr></thead>
          <tbody>{loads.map(([n, k, p]) => <tr key={n}><th scope="row">{n}</th><td>{k}</td><td>{p}</td></tr>)}</tbody>
        </table>
      </div>
      <h4>How each number is calculated</h4>
      <ul>
        <li><strong>Peak:</strong> the highest of the 96 main-switchboard totals.</li>
        <li><strong>Energy:</strong> each total × {STEP_H} h, summed.</li>
        <li><strong>Cost:</strong> energy × ${TARIFF.energyPerKwh}/kWh + ${TARIFF.demandChargePerKwAboveContracted} per kW over {fmtKw(TOWER.contractedCapacityKw)}. Placeholder tariff.</li>
        <li><strong>Board loading:</strong> load ÷ rating at every step. Above 90% needs a look; 100% and over is blocked and escalated.</li>
      </ul>
    </div>
  );
}


export function verdictSummary(m: CaseModel) {
  const v = m.review.comments.map((x) => x.verdict);
  const n = (k: string) => v.filter((x) => x === k).length;
  return [n('support') && `${n('support')} support`, n('concern') && `${n('concern')} concern`, n('block') && `${n('block')} block`].filter(Boolean).join(', ');
}

/** Revision table and title block, docked at the foot of every case like a drawing sheet. */
export function SheetFoot({ c, model }: { c: Case; model: CaseModel }) {
  const last = c.decisions.at(-1);
  return (
    <div className="sheet-foot">
      <RevisionTable c={c} />
      <TitleBlock
        number={c.id}
        title={c.title}
        status={c.status}
        rows={[
          { label: 'Asset', value: c.asset },
          { label: 'Drawn', value: userById(c.engineerId)?.name },
          { label: 'Checked', value: c.agent ? `3 agents: ${verdictSummary(model)}` : '—' },
          { label: 'Approved', value: last?.decision === 'approved' ? `${last.by} · ${last.rating}/5` : '—' },
          { label: 'Rev', value: c.revision || '—' },
          { label: 'Date', value: when(c.updatedAt) },
        ]}
      />
    </div>
  );
}
