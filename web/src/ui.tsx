import { useId, useState, type ReactNode } from 'react';
import type { CaseStatus } from '../../shared/flow.ts';
import { TERMS, type NoteLevel, type Verdict } from '../../shared/model.ts';

// ---------- icons: one stroke family, drawn here ----------

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.4v.1',
  block: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2zM8 12h8',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.6v.1',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  stop: 'M7 7h10v10H7z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  replan: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  tool: 'M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17v3h3l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.4-.6-.6-2.4z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20.5 20.5L16 16',
  chevron: 'M9 6l6 6-6 6',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g transform="rotate(-35 16 16)">
        <rect x="4.5" y="10.5" width="23" height="11" rx="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 10.5h-6a5.5 5.5 0 0 0 0 11h6z" fill="currentColor" />
      </g>
    </svg>
  );
}

// ---------- stamps: the drawing world's status words ----------

export const STAMP: Record<CaseStatus, string> = {
  drafting: 'Preliminary',
  submitted: 'Issued for approval',
  returned: 'Returned with comments',
  approved: 'Approved',
  live: 'Live',
};

export function Stamp({ status, land = false }: { status: CaseStatus; land?: boolean }) {
  return <span key={land ? status : undefined} className={`stamp stamp--${status}${land ? ' stamp--land' : ''}`}>{STAMP[status]}</span>;
}

// ---------- stars: pill health ----------

export function Stars({ value, label = 'Health' }: { value: number | null; label?: string }) {
  if (value === null) return <span className="muted">Not rated</span>;
  return (
    <span className="stars" role="img" aria-label={`${label} ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className={n <= value ? 'star on' : 'star'}>
          <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" />
        </svg>
      ))}
      <span className="stars-num">{value}/5</span>
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const name = useId();
  const words = ['', 'Poor', 'Weak', 'Adequate', 'Good', 'Excellent'];
  return (
    <fieldset className="star-input">
      <legend>Rate this pill <span className="muted">(this becomes its health)</span></legend>
      <div className="star-input-row">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={n <= value ? 'on' : ''}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" />
            </svg>
            <span className="sr-only">{n} star{n > 1 ? 's' : ''}, {words[n]}</span>
          </label>
        ))}
        <span className="star-word" aria-hidden="true">{value ? `${value}/5 · ${words[value]}` : 'Pick 1–5'}</span>
      </div>
    </fieldset>
  );
}

// ---------- glossary terms inside agent text ----------

function Term({ term, children }: { term: string; children: ReactNode }) {
  return (
    <span className="term" tabIndex={0} data-tip={TERMS[term]}>
      {children}
      <span className="sr-only"> ({TERMS[term]})</span>
    </span>
  );
}

const TERM_RE = /\((MSB|SB-[1-4]|AHUs?|inrush)\)|\bthe cap\b/g;
/** Agent text with jargon explained on hover or focus. */
export function Explained({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(TERM_RE)) {
    const i = m.index ?? 0;
    out.push(text.slice(at, i));
    if (m[1]) out.push('(', <Term key={i} term={m[1]}>{m[1]}</Term>, ')');
    else out.push(<Term key={i} term="the cap">{m[0]}</Term>);
    at = i + m[0].length;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

// ---------- verdicts and agent notes: shape + word + colour ----------

const VERDICT_ICON: Record<Verdict, IconName> = { support: 'check', concern: 'alert', block: 'block' };
export function VerdictMark({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`verdict verdict--${verdict}`}>
      <Icon name={VERDICT_ICON[verdict]} size={16} />
      {verdict === 'support' ? 'Support' : verdict === 'concern' ? 'Concern' : 'Block'}
    </span>
  );
}

const NOTE_ICON: Record<NoteLevel, IconName> = { block: 'block', warn: 'alert', info: 'info', ok: 'check' };
const NOTE_WORD: Record<NoteLevel, string> = { block: 'Will be blocked', warn: 'Needs a look', info: 'Note', ok: 'Passes' };
export function NoteLine({ level, children }: { level: NoteLevel; children: ReactNode }) {
  return (
    <li className={`note note--${level}`}>
      <Icon name={NOTE_ICON[level]} size={16} />
      <span><span className="sr-only">{NOTE_WORD[level]}: </span>{children}</span>
    </li>
  );
}

export function overallLevel(levels: NoteLevel[]): NoteLevel {
  for (const l of ['block', 'warn', 'ok'] as NoteLevel[]) if (levels.includes(l)) return l;
  return 'info';
}
export function LevelChip({ level }: { level: NoteLevel }) {
  const words: Record<NoteLevel, string> = { block: 'Will be blocked', warn: 'Needs a look', info: 'Pick measures', ok: 'Passes every check' };
  return <span className={`chip chip--${level}`}><Icon name={NOTE_ICON[level]} size={14} />{words[level]}</span>;
}

// ---------- stepper ----------

export function Stepper({ steps, current, reached, onJump, label }: { steps: string[]; current: number; reached: number; onJump: (i: number) => void; label: string }) {
  return (
    <nav className="stepper" aria-label={label}>
      <ol>
        {steps.map((s, i) => {
          const state = i === current ? 'current' : i <= reached ? 'reached' : 'locked';
          return (
            <li key={s} className={`step step--${state}`}>
              <button type="button" disabled={state !== 'reached'} aria-current={i === current ? 'step' : undefined} onClick={() => onJump(i)}>
                <span className="step-num">{i < current && i <= reached ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="step-name">{s}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function FooterNav({ back, next, nextLabel, nextDisabled, hint, busy }: {
  back?: () => void; next?: () => void; nextLabel?: string; nextDisabled?: boolean; hint?: string; busy?: boolean;
}) {
  return (
    <div className="footer-nav">
      {back ? <button type="button" className="btn" onClick={back}><Icon name="arrowLeft" size={16} />Back</button> : <span />}
      <div className="footer-nav-right">
        {nextDisabled && hint && <span className="hint">{hint}</span>}
        {next && (
          <button type="button" className="btn btn-primary" onClick={next} disabled={nextDisabled || busy} aria-busy={busy || undefined}>
            {busy ? 'Working…' : nextLabel}<Icon name="arrowRight" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- title block: identity and sign-offs, as on a drawing ----------

export interface TitleRow { label: string; value: ReactNode; wide?: boolean }
export function TitleBlock({ number, title, rows, status, land }: { number: string; title: string; rows: TitleRow[]; status: CaseStatus; land?: boolean }) {
  return (
    <section className="title-block" aria-label={`Title block for ${number}`}>
      <div className="tb-cell tb-title">
        <span className="label">Title</span>
        <strong>{title}</strong>
      </div>
      {rows.map((r) => (
        <div key={r.label} className={`tb-cell${r.wide ? ' tb-wide' : ''}`}>
          <span className="label">{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
      <div className="tb-cell tb-number">
        <span className="label">Number</span>
        <strong>{number}</strong>
      </div>
      <div className="tb-cell tb-status">
        <span className="label">Status</span>
        <Stamp status={status} land={land} />
      </div>
    </section>
  );
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="disclosure" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><Icon name="chevron" size={16} className="disclosure-chev" />{summary}</summary>
      {open && <div className="disclosure-body">{children}</div>}
    </details>
  );
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
