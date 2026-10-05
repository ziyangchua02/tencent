import { useRef, useState } from 'react';
import { samePlan } from '../../shared/comments.ts';
import { health, isEscalated, USERS, type Case, type Pill } from '../../shared/flow.ts';
import {
  baseline, BOARD_NAMES, fmtKw, fmtTime, MEASURES, OUT_OF_SCOPE, PERSPECTIVES, SAMPLE_ANSWERS, SAMPLE_COMMENT, simulateMeasures, TOWER,
  type Measure, type MeasureId,
} from '../../shared/model.ts';
import {
  AgentVerdicts, CheckPill, ImpactSchedule, Method, PillDrawing, SheetFoot, SourceTag, TunedSettings, useCaseModel, type CaseModel,
} from './casekit.tsx';
import { BuildingChart, Contributors, LoadChart, SingleLine, Timeline } from './drawings.tsx';
import { go, Link, useApp, useDraft, useLocation } from './state.tsx';
import {
  Disclosure, Explained, FooterNav, Icon, LevelChip, NoteLine, overallLevel, Stamp, Stars, Stepper, when,
} from './ui.tsx';

const STEPS = ['Define problem', 'Pills & questions', 'Confirm & send'];

// ---------- my cases ----------

export function CasesPage() {
  const { state, user, post } = useApp();
  const [busy, setBusy] = useState(false);
  if (!state || !user) return null;
  const mine = state.cases.filter((c) => c.engineerId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const base = baseline();
  const start = async () => {
    setBusy(true);
    const r = await post('/api/cases');
    setBusy(false);
    const c = r.data?.case as Case | undefined;
    if (r.ok && c) go(`/cases/${c.id}`);
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My cases</h1>
          <p className="lead">Each case turns one site problem into a pill: the agent proposes, the simulation checks, the manager decides.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
          {busy ? 'Opening…' : 'Start a new problem'}<Icon name="arrowRight" size={16} />
        </button>
      </div>

      {mine.length === 0 ? (
        <section className="viewport flagged">
          <header className="viewport-head">
            <h2 className="view-title">Flagged by metering · {TOWER.name}</h2>
            <span className="chip chip--block"><Icon name="block" size={14} />Over the cap</span>
          </header>
          <div className="flagged-body">
            <div>
              <p className="flagged-claim">{TOWER.name} drew <strong>{fmtKw(base.peakKw)}</strong> at {fmtTime(base.peakAtHour)} this morning, {fmtKw(base.peakKw - TOWER.contractedCapacityKw)} over its {fmtKw(TOWER.contractedCapacityKw)} contracted capacity.</p>
              <p className="muted">The chiller power board reached {Math.round(base.maxBoardPct.sb1)}% of its rating. Synthetic data.</p>
              <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>Work on this problem<Icon name="arrowRight" size={16} /></button>
            </div>
            <BuildingChart today={base} height={170} title="Whole building today, kW" />
          </div>
        </section>
      ) : (
        <section className="viewport">
          <header className="viewport-head"><h2 className="view-title">Case register</h2></header>
          <div className="scroll-x">
            <table className="register">
              <thead><tr><th scope="col">Number</th><th scope="col">Title</th><th scope="col">Rev</th><th scope="col">Status</th><th scope="col">Last change</th></tr></thead>
              <tbody>
                {mine.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/cases/${c.id}`} className="register-link">{c.id}</Link></td>
                    <td>{c.title}</td>
                    <td>{c.revision || '—'}</td>
                    <td><Stamp status={c.status} /></td>
                    <td>{when(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- one case ----------

export function CasePage({ id }: { id: string }) {
  const { state } = useApp();
  if (!state) return null;
  const c = state.cases.find((x) => x.id === id);
  if (!c) return <NotFound what={`Case ${id}`} back="/cases" />;
  return <CaseView c={c} pills={state.pills} />;
}

export function NotFound({ what, back }: { what: string; back: string }) {
  return (
    <div className="page">
      <h1>{what} isn't here</h1>
      <p className="lead">It may have been cleared by a demo reset.</p>
      <Link to={back} className="btn">Go back</Link>
    </div>
  );
}

function CaseView({ c, pills }: { c: Case; pills: Pill[] }) {
  const model = useCaseModel(c, pills);
  return (
    <div className="page">
      <div className="case-head">
        <div>
          <p className="crumbs"><Link to="/cases">My cases</Link> <span aria-hidden="true">/</span> {c.id}</p>
          <h1>{c.title}</h1>
        </div>
        <Stamp status={c.status} land />
      </div>

      {c.status === 'drafting' ? <Wizard c={c} pills={pills} model={model} /> : <AfterSend c={c} pills={pills} model={model} />}

      <SheetFoot c={c} model={model} />
    </div>
  );
}

// ---------- the wizard ----------

function Wizard({ c, pills, model }: { c: Case; pills: Pill[]; model: CaseModel }) {
  const { query } = useLocation();
  const reached = c.agent ? 2 : 0;
  const step = Math.min(reached, Math.max(0, Number(query.get('step') ?? 0) || 0));
  const setStep = (i: number) => go(`/cases/${c.id}?step=${i}`);
  return (
    <>
      {c.decisions.at(-1)?.decision === 'returned' && <ReturnedNote c={c} compact />}
      <Stepper steps={STEPS} current={step} reached={reached} onJump={setStep} label="Engineer steps" />
      {step === 0 && <ProblemStep c={c} model={model} onDone={() => setStep(1)} />}
      {step === 1 && <PlanStep c={c} pills={pills} model={model} setStep={setStep} />}
      {step === 2 && <ConfirmStep c={c} pills={pills} model={model} setStep={setStep} />}
    </>
  );
}

// step 1 · define the problem, with the load drawings

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
}

function ProblemStep({ c, model, onDone }: { c: Case; model: CaseModel; onDone: () => void }) {
  const { act } = useApp();
  const draft = useDraft(c.problem, (v) => void act(c.id, { type: 'update', problem: v }, (x) => ({ ...x, problem: v })));
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const Speech = speechRecognition();
  const { base, diagnosis: d } = model;

  function mic() {
    if (!Speech) return;
    if (listening) { rec.current?.stop(); setListening(false); return; }
    const r = new Speech();
    r.lang = 'en-SG';
    r.interimResults = false;
    r.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript ?? '';
      if (said) draft.onChange(draft.value ? `${draft.value} ${said}` : said);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  async function next() {
    const text = draft.take();
    setBusy(true);
    let ok = true;
    if (text !== c.problem) ok = await act(c.id, { type: 'update', problem: text });
    if (ok && (!c.agent || c.agent.problem !== text)) ok = await act(c.id, { type: 'runAgent' });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <>
      <div className="grid grid--problem">
        <section className="viewport">
          <header className="viewport-head">
            <h2 className="view-title">Load drawing · {TOWER.name} at {fmtTime(base.peakAtHour)}</h2>
            <span className="muted">Peak loading of each board, today</span>
          </header>
          <SingleLine today={base} />
          <BuildingChart today={base} height={190} />
          <div className="viewport-section">
            <h3 className="sub-title">What's running at {fmtTime(d.peakAtHour)}</h3>
            <Contributors d={d} />
            {d.startsTogether && <p className="fineprint">All 3 chillers and every <Explained text="(AHU)" /> start at {fmtTime(d.plantStart)}, right before the arrival rush.</p>}
          </div>
        </section>

        <section className="problem-side">
          <h2>{TOWER.name} breaches its cap every weekday morning</h2>
          <table className="schedule schedule--facts">
            <tbody>
              <tr><th scope="row">Contracted capacity</th><td>{fmtKw(TOWER.contractedCapacityKw)}</td><td className="muted">Penalty above this</td></tr>
              <tr><th scope="row">Peak today</th><td><strong>{fmtKw(base.peakKw)}</strong> at {fmtTime(base.peakAtHour)}</td><td><span className="flag flag--block">Over the cap</span></td></tr>
              {d.stressedBoards.map((b) => (
                <tr key={b.key}>
                  <th scope="row"><Explained text={BOARD_NAMES[b.key]} /></th>
                  <td><strong>{Math.round(b.pct)}%</strong> of rating</td>
                  <td><span className={`flag flag--${b.pct >= 100 ? 'block' : 'warn'}`}>{b.pct >= 100 ? 'Over rating' : 'Above 90%'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="field">
            <div className="field-label-row">
              <label htmlFor="problem">Describe the problem in your own words</label>
              {draft.value && <button type="button" className="link-btn" onClick={() => draft.onChange('')}>Clear</button>}
            </div>
            <p className="field-help" id="problem-help">Say what you see and anything you already do about it. The example below is from a senior engineer; edit or replace it.</p>
            <div className="textarea-row">
              <textarea id="problem" rows={7} aria-describedby="problem-help" value={draft.value} onChange={(e) => draft.onChange(e.target.value)} onBlur={draft.onBlur} />
              <button type="button" className={`btn btn-icon mic${listening ? ' mic--on' : ''}`} onClick={mic} disabled={!Speech}
                aria-pressed={listening} aria-label={listening ? 'Stop recording' : 'Dictate with your microphone'}
                title={Speech ? 'Dictate with your microphone' : 'Voice input needs a Chromium-based browser'}>
                <Icon name={listening ? 'stop' : 'mic'} size={18} />
              </button>
            </div>
            <p className="field-help">The agent picks out any measures you mention, then searches the pill library and the domain playbook.</p>
          </div>
        </section>
      </div>
      <FooterNav next={next} nextLabel={c.agent && c.agent.problem === draft.value ? 'Next: pills & questions' : 'Find pills for this problem'}
        nextDisabled={!draft.value.trim()} hint="Describe the problem to continue" busy={busy} />
    </>
  );
}

/** The live simulation, re-run on every change to the plan. */
function SimulationPanel({ c, model }: { c: Case; model: CaseModel }) {
  const { base, fix, notes } = model;
  const level = overallLevel(notes.map((n) => n.level));
  const mine = c.measures.some((m) => c.own.includes(m)) ? simulateMeasures(c.measures.filter((m) => !c.own.includes(m)), model.settings) : undefined;
  return (
    <section className="viewport simulation">
      <header className="viewport-head">
        <h2 className="view-title">Simulation · run {c.simRuns}</h2>
        <LevelChip level={level} />
      </header>
      <SingleLine today={base} proposal={c.measures.length ? fix : undefined} mine={mine} revision={c.revision + 1} />
      <BuildingChart today={base} pill={c.measures.length ? fix : undefined} pillLabel="Proposal" mine={mine} height={200} title={TOWER.name} />
      <div className="viewport-section">
        <h3 className="sub-title">Agent check</h3>
        <ul className="notes" aria-live="polite">{notes.map((n, i) => <NoteLine key={i} level={n.level}><Explained text={n.text} /></NoteLine>)}</ul>
      </div>
      {c.measures.length > 0 && <div className="viewport-section"><ImpactSchedule base={base} fix={fix} /></div>}
      <div className="viewport-section">
        <Disclosure summary="What runs when"><Timeline today={base.actions} pill={fix.actions} /></Disclosure>
        <Disclosure summary="How the simulation works"><Method base={base} fix={fix} /></Disclosure>
      </div>
    </section>
  );
}

function MeasureList({ c, pills, model }: { c: Case; pills: Pill[]; model: CaseModel }) {
  const { act } = useApp();
  const agent = c.agent;
  const toggle = (id: MeasureId) => {
    const next = c.measures.includes(id) ? c.measures.filter((m) => m !== id) : MEASURES.map((m) => m.id).filter((m) => m === id || c.measures.includes(m));
    void act(c.id, { type: 'update', measures: next }, (x) => ({ ...x, measures: next, simRuns: x.simRuns + 1, confirmed: false }));
  };
  return (
    <ul className="measures">
      {MEASURES.map((m) => {
        const origin = c.own.includes(m.id) ? 'own' : agent && m.id in agent.mentioned ? 'you' : agent?.added.some((a) => a.id === m.id) ? 'agent' : null;
        // Only what someone proposed is listed; a measure first named in a comment appears once the agent reads it.
        if (!origin && !c.measures.includes(m.id)) return null;
        const quote = origin === 'own' ? c.comments.find((e) => e.proposed?.includes(m.id))?.text : agent?.mentioned[m.id];
        return <MeasureRow key={m.id} m={m} c={c} pills={pills} model={model} origin={origin} quote={quote} onToggle={() => toggle(m.id)} />;
      })}
    </ul>
  );
}

function MeasureRow({ m, c, pills, model, origin, quote, onToggle }: {
  m: Measure; c: Case; pills: Pill[]; model: CaseModel;
  origin: 'you' | 'agent' | 'own' | null; quote?: string; onToggle: () => void;
}) {
  const on = c.measures.includes(m.id);
  const id = `measure-${m.id}`;
  const { base, settings, diagnosis } = model;
  const chart = m.chart(settings);
  return (
    <li className={`measure${on ? ' measure--on' : ''}${origin === 'own' ? ' measure--own' : ''}`}>
      <div className="measure-main">
        <input id={id} type="checkbox" checked={on} onChange={onToggle} />
        <label htmlFor={id}>{m.title}</label>
      </div>
      <div className="measure-meta">
        {origin === 'you' && <span className="origin origin--you" title={quote ? `You wrote “${quote}”` : undefined}>From your notes{quote ? `: “${quote}”` : ''}</span>}
        {origin === 'agent' && <span className="origin origin--agent">Added by agent</span>}
        {origin === 'own' && <span className="origin origin--own" title={quote ? `From your comment “${quote}”` : undefined}>Added by me</span>}
        <SourceTag id={m.id} pills={pills} />
      </div>
      <p className="measure-gist">{m.gist(settings)}</p>
      <TunedSettings measure={m.id} tuning={c.tuning} />
      <Disclosure summary="Why it helps, trade-off and chart">
        <dl className="measure-detail">
          <dt>Why it helps here</dt><dd><Explained text={m.why(diagnosis, settings)} /></dd>
          <dt>Trade-off</dt><dd>{m.tradeoff(settings)}</dd>
          <dt>Where it comes from</dt><dd>{m.origin} <span className="muted">Inspired by {m.inspiredBy.toLowerCase()}.</span></dd>
          <dt>What the simulator changes</dt><dd className="mono-data">{m.simChange(settings)}</dd>
        </dl>
        <SoloChart m={m} base={base} chart={chart} model={model} />
      </Disclosure>
    </li>
  );
}

function SoloChart({ m, base, chart, model }: { m: Measure; base: CaseModel['base']; chart: ReturnType<Measure['chart']>; model: CaseModel }) {
  const solo = simulateMeasures([m.id], model.settings);
  const idx = base.series.flatMap((s, i) => (s.t >= chart.window[0] && s.t <= chart.window[1] ? [i] : []));
  return (
    <LoadChart title={chart.title} hours={idx.map((i) => base.series[i].t)} today={idx.map((i) => base.series[i].parts[chart.part])}
      pill={idx.map((i) => solo.series[i].parts[chart.part])} pillLabel="With this alone" limit={chart.limit} band={chart.band} height={190} />
  );
}

// step 2 · the agent searches pills + playbook and proposes a plan, the simulation checks it,
// and the engineer tweaks it by ticking, commenting and answering the agent's questions (the loop)

function PlanStep({ c, pills, model, setStep }: { c: Case; pills: Pill[]; model: CaseModel; setStep: (i: number) => void }) {
  const { act } = useApp();
  const [busy, setBusy] = useState(false);
  const agent = c.agent!;
  const { notes, matches } = model;
  const level = overallLevel(notes.map((n) => n.level));
  const library = pills.filter((p) => !p.caseId);
  const usedPills = matches.filter((m) => m.role === 'measure');
  const checks = matches.filter((m) => m.role === 'check');
  const others = matches.filter((m) => m.role === 'related' || m.role === 'none');
  const fromYou = Object.keys(agent.mentioned).length;
  const replan = async () => { setBusy(true); await act(c.id, { type: 'replan' }); setBusy(false); };
  const draft = useDraft(c.answers, (v) => void act(c.id, { type: 'update', answers: v }, (x) => ({ ...x, answers: v })));
  const qs = model.questions;
  const answered = qs.filter((q) => draft.value[q.id]?.trim()).length;
  const fillSample = () => {
    const v = { ...draft.value };
    for (const q of qs) if (!v[q.id]?.trim() && SAMPLE_ANSWERS[q.id]) v[q.id] = SAMPLE_ANSWERS[q.id];
    draft.onChange(v);
  };
  const leave = (to: number) => { const v = draft.take(); void act(c.id, { type: 'update', answers: v }); setStep(to); };
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Questions, and your own comments</h2>
          <p className="muted">Your comments change the plan, and the simulation re-runs. Your answers go to the manager as the pill's captured know-how.</p>
        </div>
      </div>
      <section className="agent-bar" aria-live="polite">
        <span className="agent-badge"><Icon name="search" size={14} />Agent</span>
        <p>
          Searched <strong>{library.length} pills</strong> in the library and <strong>{MEASURES.length + OUT_OF_SCOPE.length} practices</strong> in the domain playbook.
          {' '}{fromYou ? <>Found <strong>{fromYou}</strong> measure{fromYou > 1 ? 's' : ''} in your notes</> : <>Found no measure in your notes</>}
          {agent.added.length ? <>, added <strong>{agent.added.length}</strong></> : null}, and used <strong>{usedPills.length} existing pill{usedPills.length === 1 ? '' : 's'}</strong>.
        </p>
        <div className="agent-bar-side">
          <LevelChip level={level} />
          <button type="button" className="btn" onClick={replan} disabled={busy}><Icon name="replan" size={16} />{busy ? 'Re-planning…' : 'Re-plan from my selection'}</button>
        </div>
      </section>

      {agent.added.length > 0 && (
        <ul className="added-list">
          {agent.added.map((a) => (
            <li key={a.id}><span className="origin origin--agent">Added by agent</span> <strong>{MEASURES.find((m) => m.id === a.id)?.title}.</strong> <Explained text={a.reason} /></li>
          ))}
        </ul>
      )}

      <div className="grid grid--pills">
        <section className="proposal">
          <h2>Proposed solution</h2>
          <p className="muted">Tick or untick a measure, or tell the agent what to change below. Every change re-runs the simulation.</p>
          <MeasureList c={c} pills={pills} model={model} />

          {checks.length > 0 && (
            <div className="checks">
              <h3>Required before execution</h3>
              <p className="muted">{checks[0].reason}</p>
              {checks.map((m) => <CheckPill key={m.pill.id} pill={m.pill} />)}
            </div>
          )}

          <CommentsSection c={c} />

          <div className="questions-block">
            <div className="section-head section-head--tight">
              <h2>The agent's questions</h2>
              <div className="section-head-side">
                <span className={`chip chip--${answered === qs.length ? 'ok' : 'info'}`}>{answered} of {qs.length} answered</span>
                <button type="button" className="link-btn" onClick={fillSample}>Use the example answers</button>
              </div>
            </div>
            <p className="muted">Optional, but the manager sees which ones you skipped.</p>
            <div className="questions">
              {PERSPECTIVES.map((p) => {
                const mine = qs.filter((q) => q.perspective === p);
                if (!mine.length) return null;
                return (
                  <fieldset key={p} className="question-group">
                    <legend><span className={`perspective perspective--${p.split(' ')[0].toLowerCase()}`}>{p}</span></legend>
                    {mine.map((q) => (
                      <div key={q.id} className="field">
                        <label htmlFor={`answer-${q.id}`}><Explained text={q.question} /></label>
                        <textarea id={`answer-${q.id}`} rows={2} value={draft.value[q.id] ?? ''} onBlur={draft.onBlur}
                          onChange={(e) => draft.onChange({ ...draft.value, [q.id]: e.target.value })} />
                      </div>
                    ))}
                  </fieldset>
                );
              })}
            </div>
          </div>

          <Disclosure summary={`Other pills the agent looked at (${others.length})`}>
            <ul className="others">
              {others.map((m) => (
                <li key={m.pill.id}>
                  <span className="check-pill-id">{m.pill.id}</span> <strong>{m.pill.title}</strong> <Stars value={health(m.pill)} />
                  <span className={`role role--${m.role}`}>{m.role === 'related' ? 'Related' : 'Not relevant'}</span>
                  <span className="muted"> {m.reason}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
          <Disclosure summary="Ideas that need building works (not part of this pill)">
            <ul className="others">{OUT_OF_SCOPE.map((o) => <li key={o.title}><strong>{o.title}.</strong> <span className="muted">{o.note}</span></li>)}</ul>
          </Disclosure>
        </section>
        <SimulationPanel c={c} model={model} />
      </div>
      <FooterNav back={() => leave(0)} next={() => leave(2)} nextLabel="Next: confirm & send"
        nextDisabled={c.measures.length === 0} hint="Pick at least one measure" />
    </>
  );
}

function CommentsSection({ c }: { c: Case }) {
  const { act } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = c.comments.at(-1);
  const useExample = () => setText(SAMPLE_COMMENT);
  const canUndo = !!latest && samePlan({ measures: c.measures, tuning: c.tuning }, latest.after);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await act(c.id, { type: 'comment', text: t });
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <section className="comments" aria-labelledby="comments-title">
      <h3 id="comments-title">From your comments</h3>
      <p className="muted">Tell the agent what you'd do differently, in your own words. It changes the plan and the simulation re-runs.</p>
      <div className="field">
        <div className="field-label-row">
          <label htmlFor="comment" className="sr-only">Comment for the agent</label>
          <span />
          {!text && <button type="button" className="link-btn" onClick={useExample}>Use the example comment</button>}
        </div>
        <textarea id="comment" rows={3} value={text} disabled={busy} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
          placeholder="For example: On hot days start pre-cooling at 5:30, and only run 3 EV chargers from 10 to 4." />
        <div className="comment-actions">
          <button type="button" className="btn btn-primary" onClick={send} disabled={!text.trim() || busy} aria-busy={busy || undefined}>
            <Icon name="search" size={16} />{busy ? 'The agent is reading…' : 'Send to the agent'}
          </button>
          <span className="hint">Ctrl + Enter to send</span>
        </div>
      </div>
      {busy && <p className="reading" role="status">The agent is reading your comment and re-running the simulation…</p>}
      {c.comments.length > 0 && (
        <ol className="comment-log" aria-label="What the agent did with your comments, newest first">
          {[...c.comments].reverse().map((e) => (
            <li key={e.id} className="comment-entry">
              <blockquote className="quote">{e.text}</blockquote>
              <p className="agent-reply"><span className="agent-badge"><Icon name="search" size={14} />Agent</span> {e.reply}</p>
              {e.applied.length > 0 && (
                <ul className="changes" aria-label="Changes made">
                  {e.applied.map((a, i) => (
                    <li key={i}>
                      <strong>{a.label}</strong> <span className="change-from">{a.from}</span> <span aria-hidden="true">→</span><span className="sr-only">changed to</span> <span className="change-to">{a.to}</span>
                      {a.quote && <span className="change-quote"> “{a.quote}”</span>}
                    </li>
                  ))}
                </ul>
              )}
              {e.notes.length > 0 && (
                <div className="comment-notes">
                  <span className="label">Kept as notes on the pill</span>
                  <ul>{e.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
              )}
              {e.ignored.length > 0 && (
                <ul className="comment-ignored">{e.ignored.map((x, i) => <li key={i}><Icon name="alert" size={14} />{x}</li>)}</ul>
              )}
              <p className="comment-meta">
                {when(e.at)} · read by {e.reader === 'gemini' ? 'Gemini' : 'the offline rules'}{e.fallbackReason ? ` (${e.fallbackReason})` : ''}
                {e === latest && canUndo && <> · <button type="button" className="link-btn" onClick={() => void act(c.id, { type: 'undoComment', id: e.id })}>Undo this change</button></>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// step 3 · engineer confirms, then issues for approval

function ConfirmStep({ c, pills, model, setStep }: { c: Case; pills: Pill[]; model: CaseModel; setStep: (i: number) => void }) {
  const { act } = useApp();
  const [busy, setBusy] = useState(false);
  const escalated = isEscalated(c.measures, c.tuning);
  const send = async () => { setBusy(true); const ok = await act(c.id, { type: 'submit' }); setBusy(false); if (ok) scrollTo({ top: 0 }); };
  return (
    <>
      <div className="section-head"><div><h2>Check the pill, then issue it for approval</h2><p className="muted">This is exactly what the manager will see.</p></div></div>
      <div className="grid grid--confirm">
        <PillDrawing c={c} model={model} pills={pills} />
        <aside className="confirm-side">
          <h3>What the three review agents will tell the manager</h3>
          <AgentVerdicts review={model.review} />
          {escalated && (
            <div className="callout callout--block" role="alert">
              <Icon name="block" size={18} />
              <p>A power board goes over its rating, so this will be escalated to the Head of Technical Services. The manager can only return it. Go back to step 2 to fix it.</p>
            </div>
          )}
          <label className="confirm-check">
            <input type="checkbox" checked={c.confirmed} onChange={(e) => { const v = e.target.checked; void act(c.id, { type: 'update', confirmed: v }, (x) => ({ ...x, confirmed: v })); }} />
            <span>I confirm this is how I would run {c.asset}, and the answers are my own.</span>
          </label>
        </aside>
      </div>
      <FooterNav back={() => setStep(1)} next={send} nextLabel={`Issue revision ${c.revision + 1} for approval`} busy={busy}
        nextDisabled={!c.confirmed} hint="Tick the confirmation to send" />
    </>
  );
}

// ---------- after sending ----------

function ReturnedNote({ c, compact = false, onRevise }: { c: Case; compact?: boolean; onRevise?: () => void }) {
  const d = c.decisions.at(-1)!;
  return (
    <section className={`comment-card${compact ? ' comment-card--compact' : ''}`}>
      <div className="comment-head">
        <strong>{compact ? `Comments on revision ${d.revision}` : 'Comments from the Asset Operations Manager'}</strong>
        <span className="muted">{d.by} · {when(d.at)}</span>
      </div>
      <blockquote className="quote quote--comment">{d.reason}</blockquote>
      {onRevise && <button type="button" className="btn btn-primary" onClick={onRevise}><Icon name="replan" size={16} />Revise the pill</button>}
    </section>
  );
}

function AfterSend({ c, pills, model }: { c: Case; pills: Pill[]; model: CaseModel }) {
  const { act } = useApp();
  const manager = USERS.find((u) => u.role === 'manager')?.name ?? 'the manager';
  const d = c.decisions.at(-1);
  const pill = pills.find((p) => p.id === c.pillId);
  const ev = c.evidence;
  const redo = async () => { if (await act(c.id, { type: 'redo' })) go(`/cases/${c.id}?step=1`); };
  return (
    <>
      <section className={`status-panel status-panel--${c.status}`}>
        {c.status === 'submitted' && (
          <>
            <h2>Issued to {manager} for approval</h2>
            <p>Revision {c.revision}, sent {ev && when(ev.at)}. The server re-ran the simulation: peak {fmtKw(ev?.baselinePeakKw ?? 0)} → <strong>{fmtKw(ev?.peakKw ?? 0)}</strong>.</p>
            <a className="btn" href={`/review/${c.id}?as=priya`} target="_blank" rel="noopener">Open the manager's view in a new window<Icon name="arrowRight" size={16} /></a>
          </>
        )}
        {c.status === 'returned' && d && (
          <>
            <h2>Returned with comments</h2>
            <ReturnedNote c={c} onRevise={redo} />
          </>
        )}
        {(c.status === 'approved' || c.status === 'live') && d && (
          <>
            <h2>{c.status === 'live' ? `Live at ${c.asset}` : 'Approved'}</h2>
            <p><Stars value={d.rating ?? null} label="Rated" /> <span className="muted">by {d.by}, {when(d.at)}</span></p>
            <blockquote className="quote quote--comment">{d.reason}</blockquote>
            <p>
              {c.status === 'live'
                ? <>Runs from the next weekday start-up. </>
                : <>Waiting for {d.by} to execute it at {c.asset}. </>}
              {pill && <Link to={`/pills/${pill.id}`}>Open {pill.id} in the pill library</Link>}
            </p>
          </>
        )}
      </section>
      <div className="grid grid--after">
        <section className="viewport">
          <header className="viewport-head"><h2 className="view-title">Simulated impact · revision {c.revision}</h2></header>
          <BuildingChart today={model.base} pill={model.fix} pillLabel="With the pill" height={200} />
          <div className="viewport-section"><ImpactSchedule base={model.base} fix={model.fix} /></div>
        </section>
        <section>
          <h2 className="h-small">Review agents</h2>
          <AgentVerdicts review={model.review} />
        </section>
      </div>
      <PillDrawing c={c} model={model} pills={pills} />
    </>
  );
}
