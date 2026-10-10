import { useState } from 'react';
import { currentRev, health, userById, type Pill } from '../../shared/flow.ts';
import type { Answer, Citation } from '../../shared/retrieval-types.ts';
import { NotFound } from './engineer.tsx';
import { Link, useApp } from './state.tsx';
import { Icon, StarInput, Stars, TitleBlock, when } from './ui.tsx';

export function LibraryPage() {
  const { state } = useApp();
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('All domains');
  if (!state) return null;
  const domains = ['All domains', ...new Set(state.pills.map((p) => p.domain))];
  const needle = q.trim().toLowerCase();
  const shown = state.pills.filter((p) =>
    (domain === 'All domains' || p.domain === domain) &&
    (!needle || [p.id, p.title, p.summary, p.system, p.owner.name, p.owner.site].join(' ').toLowerCase().includes(needle)));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pill library</h1>
          <p className="lead">Approved know-how, tagged by system so any building with the same equipment can reuse it. Health is the manager's latest rating.</p>
        </div>
      </div>
      <div className="filters" role="search">
        <label className="filter-search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search pills</span>
          <input type="search" placeholder="Search by system, site or person" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="filter-select">
          <span className="sr-only">Domain</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)}>{domains.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
        <span className="muted" aria-live="polite">{shown.length} of {state.pills.length} pills</span>
      </div>
      <AskPanel />
      <section className="viewport">
        <div className="scroll-x">
          <table className="register">
            <thead><tr><th scope="col">Number</th><th scope="col">Title</th><th scope="col">System</th><th scope="col">Captured from</th><th scope="col">Live at</th><th scope="col">Rev</th><th scope="col">Health</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={p.caseId ? 'row-own' : undefined}>
                  <td><Link to={`/pills/${p.id}`} className="register-link">{p.id}</Link></td>
                  <td><strong>{p.title}</strong><br /><span className="muted">{p.domain}</span></td>
                  <td>{p.system}</td>
                  <td>{p.owner.name}<br /><span className="muted">{p.owner.title}, {p.owner.site}</span></td>
                  <td>{p.sites.length ? p.sites.join(', ') : <span className="muted">Approved, not yet live</span>}</td>
                  <td>{currentRev(p)}</td>
                  <td><Stars value={health(p)} /></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="empty-row">No pills match. Clear the search to see all {state.pills.length}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function PillPage({ id }: { id: string }) {
  const { state, user } = useApp();
  if (!state) return null;
  const p = state.pills.find((x) => x.id === id);
  if (!p) return <NotFound what={`Pill ${id}`} back="/pills" />;
  const byId = (pid: string) => state.pills.find((x) => x.id === pid);
  return (
    <div className="page">
      <div className="case-head">
        <div>
          <p className="crumbs"><Link to="/pills">Pill library</Link> <span aria-hidden="true">/</span> {p.id}</p>
          <h1>{p.title}</h1>
          <p className="lead">{p.summary}</p>
        </div>
        <PdfButton pillId={p.id} />
      </div>
      <div className="grid grid--pill">
        <div className="pill-body">
          <section>
            <h2 className="h-small">Steps</h2>
            <ol className="check-steps">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
          <section>
            <h2 className="h-small">Guardrails</h2>
            <ul className="guardrails">{p.guardrails.map((g) => <li key={g}><Icon name="alert" size={14} />{g}</li>)}</ul>
          </section>
          <section>
            <h2 className="h-small">Tools</h2>
            <p>{p.tools.join(', ')}</p>
          </section>
          {(p.composedOf?.length || p.checks?.length) ? (
            <section>
              <h2 className="h-small">Built from the library</h2>
              <ul className="links">
                {p.composedOf?.map((x) => <li key={x}><Link to={`/pills/${x}`}>{x}</Link> {byId(x)?.title} <span className="muted">· measure</span></li>)}
                {p.checks?.map((x) => <li key={x}><Link to={`/pills/${x}`}>{x}</Link> {byId(x)?.title} <span className="muted">· required check before execution</span></li>)}
              </ul>
            </section>
          ) : null}
          {p.knowHow?.length ? (
            <section>
              <h2 className="h-small">Captured know-how</h2>
              <dl className="knowhow">{p.knowHow.map((k) => <div key={k.question} className="knowhow-row"><dt>{k.question}</dt><dd>{k.answer}</dd></div>)}</dl>
            </section>
          ) : null}
          {p.caseId && <p className="muted">Created from case <Link to={user?.role === 'manager' ? `/review/${p.caseId}` : `/cases/${p.caseId}`}>{p.caseId}</Link>.</p>}
        </div>
        <aside className="pill-aside">
          <HealthPanel p={p} canRate={user?.role === 'manager'} />
          <table className="rev-table">
            <caption>Revisions</caption>
            <thead><tr><th scope="col">Rev</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">By</th></tr></thead>
            <tbody>{[...p.revisions].reverse().map((r) => <tr key={r.rev}><td>{r.rev}</td><td>{r.date}</td><td>{r.note}</td><td>{r.by}</td></tr>)}</tbody>
          </table>
        </aside>
      </div>
      <div className="sheet-foot">
        <span />
        <TitleBlock number={p.id} title={p.title} status={p.status} rows={[
          { label: 'Domain', value: p.domain },
          { label: 'System', value: p.system },
          { label: 'Owner', value: `${p.owner.name}, ${p.owner.site}` },
          { label: 'Live at', value: p.sites.join(', ') || '—' },
          { label: 'Rev', value: currentRev(p) },
          { label: 'Health', value: <Stars value={health(p)} /> },
        ]} />
      </div>
    </div>
  );
}

function HealthPanel({ p, canRate }: { p: Pill; canRate: boolean }) {
  const { post } = useApp();
  const [rating, setRating] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await post(`/api/pills/${p.id}/rate`, { rating, reason: reason.trim() });
    setBusy(false);
    if (r.ok) { setRating(0); setReason(''); }
  };
  return (
    <section className="health">
      <h2 className="h-small">Health</h2>
      <p className="health-now"><Stars value={health(p)} /> <span className="muted">The manager's latest rating.</span></p>
      <ol className="health-history">
        {[...p.ratings].reverse().map((r, i) => (
          <li key={i}><Stars value={r.rating} label="Rated" /> <span className="muted">{r.at} · {r.by}</span><br />{r.reason}</li>
        ))}
      </ol>
      {canRate && (
        <form className="rerate" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <StarInput value={rating} onChange={setRating} />
          <div className="field">
            <label htmlFor="rate-reason">What changed? <span className="muted">(required)</span></label>
            <textarea id="rate-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: tripped twice on hot mornings last week." />
          </div>
          <button type="submit" className="btn" disabled={!rating || !reason.trim() || busy}>{busy ? 'Saving…' : 'Update health'}</button>
        </form>
      )}
    </section>
  );
}

function PdfButton({ pillId }: { pillId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pills/${pillId}/pdf`, { headers: { 'x-demo-user': sessionStorage.getItem('ip.user') ?? '' } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pdf-button-wrap">
      <button type="button" className="btn" onClick={download} disabled={busy} aria-busy={busy || undefined} aria-label={`Download ${pillId} as PDF`} accessKey="p">
        {busy ? 'Generating…' : 'PDF'}<Icon name="doc" size={16} />
      </button>
      {error && <span className="muted" role="alert">{error}</span>}
    </div>
  );
}

function AskPanel() {
  const { post } = useApp();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const r = await post('/api/ask', { question: q });
    setBusy(false);
    if (r.ok && r.data?.answer) {
      setAnswer(r.data.answer as Answer);
    } else {
      setError((r.data?.error as string) ?? 'Could not get an answer.');
    }
  };

  return (
    <section className="ask-panel" aria-label="Ask the pill library">
      <form onSubmit={submit} className="ask-form">
        <label className="filter-search ask-input">
          <Icon name="mic" size={16} />
          <span className="sr-only">Ask a question</span>
          <input
            type="text"
            placeholder="Ask the pill library…  e.g. How do I stagger chiller starts?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAnswer(null); setError(null); } }}
            aria-label="Ask the pill library a question"
            accessKey="a"
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!question.trim() || busy} aria-busy={busy || undefined}>
          {busy ? 'Searching…' : 'Ask'}<Icon name="arrowRight" size={16} />
        </button>
      </form>
      {error && <p className="ask-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
      {answer && <AskResult answer={answer} />}
    </section>
  );
}

function AskResult({ answer }: { answer: Answer }) {
  if (answer.refused) {
    return (
      <div className="ask-answer ask-refused" role="status">
        <p><Icon name="info" size={16} />{answer.reason}</p>
      </div>
    );
  }
  return (
    <div className="ask-answer" role="region" aria-label="Answer from the pill library">
      <div className="ask-answer-text">
        {answer.text.split('\n').map((line, i) => <p key={i}>{line}</p>)}
      </div>
      {answer.citations.length > 0 && (
        <details className="ask-citations">
          <summary>Citations ({answer.citations.length})</summary>
          <ul className="citation-list">
            {answer.citations.map((c, i) => <CitationItem key={i} c={c} index={i} />)}
          </ul>
        </details>
      )}
      {answer.fallbackReason && <p className="muted ask-fallback"><Icon name="info" size={12} />{answer.fallbackReason}</p>}
    </div>
  );
}

function CitationItem({ c, index }: { c: Citation; index: number }) {
  return (
    <li className="citation-item">
      <span className="citation-num">[{index + 1}]</span>
      <div>
        <Link to={`/pills/${c.pillId}`} className="citation-pill">{c.pillId}</Link>
        <span className="muted"> · {c.pillTitle} · {c.section}</span>
        <p className="citation-text">{c.text}</p>
      </div>
    </li>
  );
}

const ACTION_WORDS: Record<string, string> = {
  open: 'Opened case', runAgent: 'Agent proposed', replan: 'Agent re-planned', submit: 'Issued for approval', redo: 'Reopened to revise',
  approve: 'Approved', return: 'Returned', execute: 'Executed', sample: 'Loaded sample', rate: 'Updated health', reset: 'Reset demo', seed: 'Seeded library',
  ask: 'Asked library',
};

export function AuditPage() {
  const { state, user } = useApp();
  if (!state) return null;
  const href = (t: string) => t.startsWith('CASE-') ? (user?.role === 'manager' ? `/review/${t}` : `/cases/${t}`) : t.startsWith('PILL-') ? `/pills/${t}` : null;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p className="lead">Every decision, by whom and when. Append-only: the database refuses edits and deletes. Only a demo reset starts a fresh log.</p>
        </div>
      </div>
      <section className="viewport">
        <div className="scroll-x">
          <table className="register register--audit">
            <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">On</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {state.audit.map((e) => {
                const to = href(e.target);
                return (
                  <tr key={e.seq}>
                    <td className="nowrap">{when(e.at)}</td>
                    <td>{e.actor}<br /><span className="muted">{e.role === 'system' ? 'System' : userById(state.users.find((u) => u.name === e.actor)?.id)?.title ?? e.role}</span></td>
                    <td><span className={`action action--${e.action}`}>{ACTION_WORDS[e.action] ?? e.action}</span></td>
                    <td className="nowrap">{to ? <Link to={to}>{e.target}</Link> : e.target}</td>
                    <td>{e.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
