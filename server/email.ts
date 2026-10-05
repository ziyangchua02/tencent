// Notification emails through Resend's HTTP API. Render's free tier blocks SMTP ports, and an HTTP call
// keeps the server dependency-free. Without RESEND_API_KEY nothing is sent. A failed email never blocks
// the workflow: the caller records the outcome in the audit log.
import type { Case, User } from '../shared/flow.ts';
import { fmtKw } from '../shared/model.ts';

export interface Mail { to: string; toName: string; subject: string; heading: string; lines: string[]; link?: { href: string; label: string } }
export type Sent = { ok: true } | { ok: false; error: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function html(m: Mail) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#16202b;max-width:560px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5f6b78;margin:0 0 8px">Intelligence Pills</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(m.heading)}</h1>
${m.lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join('\n')}
${m.link ? `<p style="margin:18px 0"><a href="${esc(m.link.href)}" style="background:#1f5fbf;color:#fff;padding:10px 16px;text-decoration:none;font-weight:bold">${esc(m.link.label)}</a></p>` : ''}
<p style="font-size:12px;color:#5f6b78;margin-top:24px">Synthetic demo data. Change your email or turn these off under your profile.</p>
</div>`;
}

export async function sendMail(m: Mail): Promise<Sent> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: 'No RESEND_API_KEY is set on the server.' };
  const text = [m.heading, '', ...m.lines, ...(m.link ? ['', `${m.link.label}: ${m.link.href}`] : [])].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM?.trim() || 'Intelligence Pills <onboarding@resend.dev>', to: [m.to], subject: m.subject, html: html(m), text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({})) as { message?: string };
    return { ok: false, error: data.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out' : e.message) : 'unknown error' };
  }
}

const VERDICT = { support: 'supports', concern: 'has concerns', block: 'blocks' } as const;
const AGENTS = ['Energy', 'Tenant Experience', 'Technical Services'];

/** Who hears about a case event: the manager when it is issued, the engineer when it is approved or returned. */
export function caseMails(c: Case, event: 'submit' | 'approve' | 'return', people: (User & { email: string; notify: boolean })[], base: string): Mail[] {
  const engineer = people.find((u) => u.id === c.engineerId);
  const to = event === 'submit' ? people.filter((u) => u.role === 'manager') : engineer ? [engineer] : [];
  const d = c.decisions.at(-1);
  const ev = c.evidence;
  return to.filter((u) => u.notify && u.email).map((u): Mail => {
    const open = (path: string) => `${base}${path}?as=${u.id}`;
    if (event === 'submit') {
      return {
        to: u.email, toName: u.name,
        subject: `${c.id} needs your approval: ${c.title} (revision ${c.revision})`,
        heading: `${engineer?.name ?? 'An engineer'} issued a pill for your approval`,
        lines: [
          `${c.title}, revision ${c.revision}, at ${c.asset}.`,
          ...(ev ? [`The server re-ran the simulation: peak ${fmtKw(ev.baselinePeakKw)} → ${fmtKw(ev.peakKw)}.`,
            `Review agents: ${ev.verdicts.map((v, i) => `${AGENTS[i]} ${VERDICT[v]}`).join(', ')}.`] : []),
          ...(ev?.authority === 'escalate' ? ['A power board goes over its rating, so this one is escalated. You can return it but not approve it.'] : []),
        ],
        link: { href: open(`/review/${c.id}`), label: 'Open the review' },
      };
    }
    if (event === 'approve') {
      return {
        to: u.email, toName: u.name,
        subject: `Approved: ${c.title} is now ${c.pillId}`,
        heading: `${d?.by ?? 'The manager'} approved your pill`,
        lines: [
          `Revision ${d?.revision} of “${c.title}” is approved with ${d?.rating} of 5 stars.`,
          `“${d?.reason}”`,
          `It is in the pill library as ${c.pillId}, waiting to be executed at ${c.asset}.`,
        ],
        link: { href: open(`/cases/${c.id}`), label: 'Open the case' },
      };
    }
    return {
      to: u.email, toName: u.name,
      subject: `Returned with comments: ${c.title}`,
      heading: `${d?.by ?? 'The manager'} returned your pill with comments`,
      lines: [`Revision ${d?.revision} of “${c.title}”:`, `“${d?.reason}”`, 'Reopen the case to revise it and issue the next revision.'],
      link: { href: open(`/cases/${c.id}`), label: 'Revise the pill' },
    };
  });
}
