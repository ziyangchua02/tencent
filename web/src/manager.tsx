import { useEffect, useState } from 'react';
import { isEscalated, userById, ESCALATION_ROLE, type Case, type Pill } from '../../shared/flow.ts';
import { fmtKw, MEASURES, type Verdict } from '../../shared/model.ts';
import { AgentVerdicts, ImpactSchedule, Method, PillDrawing, SheetFoot, SourceTag, TunedSettings, useCaseModel, type CaseModel } from './casekit.tsx';
import { BuildingChart, BuildingThroughTheDay, SingleLine, Timeline } from './drawings.tsx';
import { NotFound } from './engineer.tsx';
import { go, Link, useApp, useLocation, useSeen } from './state.tsx';
import { Disclosure, FooterNav, Icon, Stamp, StarInput, Stars, Stepper, VerdictMark, when } from './ui.tsx';

const ORDER: Record<Case['status'], number> = { submitted: 0, approved: 1, returned: 2, live: 3, drafting: 4 };
const seenKey = (c: Case) => `${c.id}@${c.revision}`;

export function QueuePage() {
  const { state, post } = useApp();
  const { seen } = useSeen();
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const issued = state.cases.filter((c) => c.status !== 'drafting')
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  const drafting = state.cases.filter((c) => c.status === 'drafting').length;
  const waiting = issued.filter((c) => c.status === 'submitted').length;
  const sample = async () => { setBusy(true); await post('/api/sample'); setBusy(false); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p className="lead">Pills issued by engineers. Each arrives with its simulation and three review agents' verdicts. Nothing goes live without your decision.</p>
        </div>
        <p className="queue-count">
          <strong>{waiting}</strong> waiting for you
          {drafting > 0 && <span className="muted"> · {drafting} being drafted</span>}
        </p>
      </div>

      {issued.length === 0 ? (
        <section className="viewport empty">
          <h2>Nothing to review yet</h2>
          <p className="muted">When an engineer issues a pill, it appears here straight away. Sign in as the engineer in another window to send one, or load a sample.</p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={sample} disabled={busy}>{busy ? 'Loading…' : 'Load a sample case'}</button>
            <a className="btn" href="/cases?as=wei_ming" target="_blank" rel="noopener">Open the engineer in a new window</a>
          </div>
        </section>
      ) : (
        <section className="viewport">
          <div className="scroll-x">
            <table className="register register--queue">
              <thead>
                <tr><th scope="col">Number</th><th scope="col">Title</th><th scope="col">Engineer</th><th scope="col">Rev</th><th scope="col">Peak today → pill</th><th scope="col">Agents</th><th scope="col">Status</th><th scope="col">Issued</th></tr>
              </thead>
              <tbody>
                {issued.map((c) => {
                  const fresh = c.status === 'submitted' && !seen.has(seenKey(c));
                  const ev = c.evidence;
                  return (
                    <tr key={c.id} className={fresh ? 'row-new' : undefined}>
                      <td>
                        <Link to={`/review/${c.id}`} className="register-link">{c.id}</Link>
                        {fresh && <span className="new-tag">New</span>}
                      </td>
                      <td>{c.title}</td>
                      <td>{userById(c.engineerId)?.name}</td>
                      <td>{c.revision}</td>
                      <td>{ev ? <>{fmtKw(ev.baselinePeakKw)} → <strong>{fmtKw(ev.peakKw)}</strong></> : '—'}</td>
                      <td>{ev && <VerdictCounts verdicts={ev.verdicts} />}</td>
                      <td><Stamp status={c.status} /></td>
                      <td>{ev ? when(ev.at) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function VerdictCounts({ verdicts }: { verdicts: Verdict[] }) {
  const kinds: Verdict[] = ['block', 'concern', 'support'];
  return (
    <span className="verdict-counts">
      {kinds.filter((k) => verdicts.includes(k)).map((k) => (
        <span key={k} className={`verdict verdict--${k}`}><Icon name={k === 'support' ? 'check' : k === 'concern' ? 'alert' : 'block'} size={14} />{verdicts.filter((v) => v === k).length} {k}</span>
      ))}
    </span>
  );
}

// ---------- one review ----------

const VIEWS = ['At a glance', 'Evidence', 'Decide'];
const TABS = ['Load profile', 'Building through the day', 'Before / after', 'How it was simulated'] as const;

export function ReviewPage({ id }: { id: string }) {
  const { state } = useApp();
  if (!state) return null;
  const c = state.cases.find((x) => x.id === id);
  if (!c) return <NotFound what={`Case ${id}`} back="/review" />;
  return <Review c={c} pills={state.pills} />;
}

function Review({ c, pills }: { c: Case; pills: Pill[] }) {
  const model = useCaseModel(c, pills);
  const { mark } = useSeen();
  const { query } = useLocation();
  const view = Math.min(2, Math.max(0, Number(query.get('view') ?? 0) || 0));
  const setView = (i: number) => go(`/review/${c.id}?view=${i}`);
  useEffect(() => { if (c.status === 'submitted') mark(seenKey(c)); }, [c, mark]);

  return (
    <div className="page">
      <div className="case-head">
        <div>
          <p className="crumbs"><Link to="/review">Review queue</Link> <span aria-hidden="true">/</span> {c.id}</p>
          <h1>{c.title}</h1>
        </div>
        <Stamp status={c.status} land />
      </div>

      {c.status === 'drafting' ? (
        <section className="viewport empty">
          <h2>{c.decisions.length ? 'The engineer is revising this pill' : 'Still being drafted'}</h2>
          <p className="muted">{c.decisions.length ? 'Your comments were sent. The revised pill appears in your queue as soon as it is re-issued.' : "The engineer hasn't issued this case yet."}</p>
          <Link to="/review" className="btn">Back to the queue</Link>
        </section>
      ) : (
        <>
          <Stepper steps={VIEWS} current={view} reached={2} onJump={setView} label="Review steps" />
          {view === 0 && <Glance c={c} pills={pills} model={model} />}
          {view === 1 && <Evidence model={model} />}
          {view === 2 && <Decide c={c} model={model} />}
          {view === 0 && <FooterNav next={() => setView(1)} nextLabel="See the evidence" />}
          {view === 1 && <FooterNav back={() => setView(0)} next={() => setView(2)} nextLabel="Go to the decision" />}
          {view === 2 && <FooterNav back={() => setView(1)} />}
        </>
      )}
      <SheetFoot c={c} model={model} />
    </div>
  );
}

function Glance({ c, pills, model }: { c: Case; pills: Pill[]; model: CaseModel }) {
  const ev = c.evidence!;
  const skipped = model.questions.filter((q) => !c.answers[q.id]?.trim()).length;
  const n = (k: Verdict) => model.review.comments.filter((x) => x.verdict === k).length;
  return (
    <>
      <p className="evidence-line">
        <strong>Revision {c.revision}</strong> from {userById(c.engineerId)?.name} · re-simulated on the server {when(ev.at)} · peak {fmtKw(ev.baselinePeakKw)} → <strong>{fmtKw(ev.peakKw)}</strong>
        {ev.authority === 'escalate' && <span className="chip chip--block"><Icon name="block" size={14} />Escalated</span>}
      </p>
      <div className="grid grid--glance">
        <section className="proposal">
          <h2>Proposed by engineering</h2>
          <ul className="measure-list">
            {MEASURES.filter((m) => c.measures.includes(m.id)).map((m) => <li key={m.id}><strong>{m.title}</strong><SourceTag id={m.id} pills={pills} /><TunedSettings measure={m.id} tuning={c.tuning} /></li>)}
          </ul>
          <blockquote className="quote">{c.problem}</blockquote>
          {skipped > 0 && <p className="callout callout--warn"><Icon name="alert" size={16} />The engineer skipped {skipped} of {model.questions.length} reviewer questions.</p>}
        </section>
        <section className="viewport">
          <header className="viewport-head"><h2 className="view-title">Load drawing · revision {c.revision}</h2></header>
          <SingleLine today={model.base} proposal={model.fix} revision={c.revision} />
        </section>
      </div>
      <div className="grid grid--glance2">
        <section>
          <h2 className="h-small">What changes</h2>
          <ImpactSchedule base={model.base} fix={model.fix} />
        </section>
        <section>
          <h2 className="h-small">What the three review agents say <span className="muted">({n('support')} support{n('concern') ? `, ${n('concern')} concern` : ''}{n('block') ? `, ${n('block')} block` : ''})</span></h2>
          <AgentVerdicts review={model.review} />
        </section>
      </div>
      <Disclosure summary="Read the full pill"><PillDrawing c={c} model={model} pills={pills} /></Disclosure>
    </>
  );
}

function Evidence({ model }: { model: CaseModel }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Load profile');
  const slug = (t: string) => t.toLowerCase().replace(/\W+/g, '-');
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.indexOf(tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    document.getElementById(`tab-${slug(next)}`)?.focus();
  };
  return (
    <section className="viewport">
      <header className="viewport-head">
        <h2 className="view-title">Evidence</h2>
        <span className="muted">Read-only. Nothing here changes the pill.</span>
      </header>
      <div className="tabs" role="tablist" aria-label="Evidence" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button key={t} id={`tab-${slug(t)}`} type="button" role="tab" aria-selected={tab === t} aria-controls="evidence-panel"
            tabIndex={tab === t ? 0 : -1} className={tab === t ? 'tab tab--on' : 'tab'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div id="evidence-panel" role="tabpanel" aria-labelledby={`tab-${slug(tab)}`} className="tab-panel">
        {tab === 'Load profile' && <BuildingChart today={model.base} pill={model.fix} pillLabel="With the pill" from={0} to={23.75} height={260} title="Whole building over the full day, kW" />}
        {tab === 'Building through the day' && <BuildingThroughTheDay today={model.base} pill={model.fix} />}
        {tab === 'Before / after' && (
          <>
            <ImpactSchedule base={model.base} fix={model.fix} withCost />
            <p className="fineprint">Placeholder tariff: cost figures are synthetic, not real utility rates.</p>
            <Timeline today={model.base.actions} pill={model.fix.actions} />
          </>
        )}
        {tab === 'How it was simulated' && <Method base={model.base} fix={model.fix} />}
      </div>
    </section>
  );
}

function Decide({ c, model }: { c: Case; model: CaseModel }) {
  const { act } = useApp();
  const [rating, setRating] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const escalated = isEscalated(c.measures, c.tuning);
  const d = c.decisions.at(-1);
  const run = async (key: string, f: () => Promise<boolean>) => { setBusy(key); const ok = await f(); setBusy(null); if (ok) { setReason(''); setRating(0); } };

  if (c.status === 'approved' || c.status === 'live') {
    return (
      <section className={`status-panel status-panel--${c.status}`}>
        <h2>{c.status === 'live' ? `Live at ${c.asset}` : 'Approved. Ready to execute.'}</h2>
        {d && <p><Stars value={d.rating ?? null} label="Your rating" /> <span className="muted">{when(d.at)}</span></p>}
        {d && <blockquote className="quote quote--comment">{d.reason}</blockquote>}
        {c.status === 'approved' ? (
          <>
            <p>Executing schedules the pill for the next weekday start-up and marks it live in the pill library.</p>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run('execute', () => act(c.id, { type: 'execute' }))}>
              <Icon name="bolt" size={16} />{busy ? 'Executing…' : `Execute at ${c.asset}`}
            </button>
          </>
        ) : (
          <p>Runs from the next weekday start-up. {c.pillId && <Link to={`/pills/${c.pillId}`}>Open {c.pillId} in the pill library</Link>}</p>
        )}
      </section>
    );
  }
  if (c.status === 'returned') {
    return (
      <section className="status-panel status-panel--returned">
        <h2>Returned to the engineer</h2>
        {d && <blockquote className="quote quote--comment">{d.reason}</blockquote>}
        <p className="muted">The revised pill comes back to your queue when it is re-issued.</p>
      </section>
    );
  }
  const missing = !reason.trim();
  return (
    <section className="decide">
      <h2>Approve or return</h2>
      <p className="evidence-line">Peak {fmtKw(model.base.peakKw)} → <strong>{fmtKw(model.fix.peakKw)}</strong> · {model.review.comments.map((x) => <VerdictMark key={x.agent} verdict={x.verdict} />)}</p>
      {escalated && (
        <div className="callout callout--block" role="alert">
          <Icon name="block" size={18} />
          <p>Escalated to the {ESCALATION_ROLE}: a power board goes over its rating in this run. You can't approve it here. Return it with comments, or ask Technical Services to sign off.</p>
        </div>
      )}
      {!escalated && <StarInput value={rating} onChange={setRating} />}
      <div className="field">
        <label htmlFor="reason">Reason <span className="muted">(required, the engineer sees this)</span></label>
        <textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you approving or returning this pill?" />
      </div>
      <div className="decide-actions">
        <button type="button" className="btn btn-primary" disabled={escalated || missing || !rating || !!busy}
          onClick={() => run('approve', () => act(c.id, { type: 'approve', reason: reason.trim(), rating }))}>
          <Icon name="check" size={16} />{busy === 'approve' ? 'Approving…' : 'Approve and rate'}
        </button>
        <button type="button" className="btn btn-danger" disabled={missing || !!busy}
          onClick={() => run('return', () => act(c.id, { type: 'return', reason: reason.trim() }))}>
          {busy === 'return' ? 'Returning…' : 'Return with comments'}
        </button>
        {(missing || (!rating && !escalated)) && <span className="hint">{missing ? 'Write a reason to approve or return.' : 'Rate the pill to approve it.'}</span>}
      </div>
    </section>
  );
}
