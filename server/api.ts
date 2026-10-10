// The JSON API. One handler, mounted by Vite in development and by server/main.ts in production.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  applyAction, FlowError, newCase, sampleCase, USERS, userById,
  type Action, type AppState, type Pill, type Profile, type User,
} from '../shared/flow.ts';
import { caseMails, isEmail, sendMail, type Mail } from './email.ts';
import { readComment } from './gemini.ts';
import { chunkPill } from './chunker.ts';
import { generatePillPdf, hasCurrentLayout, titleLookup } from './pdf.ts';
import { ask } from './retrieval.ts';
import type { AskResponse } from '../shared/retrieval-types.ts';
import { ensureSeedPdfs, type Store } from './store.ts';

type Next = () => void;
const MAX_BODY = 64 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new FlowError('Request too large.', 413);
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* fall through */ }
  throw new FlowError('Body must be a JSON object.', 400);
}

/** The address people use to reach this server, for links in emails. APP_URL overrides it. */
function baseUrl(req: IncomingMessage) {
  if (process.env.APP_URL?.trim()) return process.env.APP_URL.trim().replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
  return `${proto}://${req.headers.host ?? 'localhost'}`;
}

export function createApi(store: Store) {
  let version = 1;
  const reading = new Set<string>(); // cases with a comment being read right now
  const listeners = new Set<ServerResponse>();
  const changed = () => {
    version += 1;
    for (const res of listeners) res.write(`data: ${version}\n\n`);
  };
  // A profile's email starts from MANAGER_EMAIL / ENGINEER_EMAIL, so it survives a host that wipes its disk.
  const profileOf = (u: User): Profile => {
    const p = store.profile(u.id);
    return { email: p.email ?? process.env[`${u.role.toUpperCase()}_EMAIL`]?.trim() ?? '', notify: p.notify ?? true, ...(p.photo && { photo: p.photo }) };
  };
  const people = () => USERS.map((u) => ({ ...u, ...profileOf(u) }));
  const lastTest = new Map<string, number>();
  // Per-user rate limit on Gemini model calls (comment reading + /api/ask).
  const MODEL_LIMIT = 10; // calls per minute
  const MODEL_WINDOW = 60_000;
  const modelCalls = new Map<string, number[]>();
  const checkModelLimit = (userId: string): number => {
    const now = Date.now();
    const times = (modelCalls.get(userId) ?? []).filter((t) => now - t < MODEL_WINDOW);
    if (times.length >= MODEL_LIMIT) return Math.ceil((MODEL_WINDOW - (now - times[0])) / 1000);
    modelCalls.set(userId, [...times, now]);
    return 0;
  };
  const refreshPdf = (pill: Pill) => {
    generatePillPdf(pill, titleLookup(store.pills())).then((pdf) => store.putPdf(pill.id, pdf, new Date().toISOString()))
      .catch((e) => console.warn(`PDF gen ${pill.id} failed:`, e));
  };
  /** Send in the background and record each outcome in the audit log, without the address. */
  const deliver = (mails: Mail[], target: string) => {
    for (const m of mails) {
      void sendMail(m).then((r) => {
        store.log({ at: new Date().toISOString(), actor: 'system', role: 'system', action: 'email', target,
          detail: r.ok ? `Emailed ${m.toName}: “${m.subject}”.` : `Email to ${m.toName} failed: ${r.error}` });
        changed();
      });
    }
  };
  // Every browser gets names and photos; email addresses only go to their owner's profile page.
  const state = (): AppState & { users: User[] } => ({
    version, users: people().map(({ email: _e, notify: _n, ...u }) => u), cases: store.cases(), pills: store.pills(), audit: store.audit(),
  });

  return async function api(req: IncomingMessage, res: ServerResponse, next: Next) {
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    if (path === '/healthz') return send(res, 200, { ok: true });
    if (!path.startsWith('/api/')) return next();

    try {
      if (req.method === 'GET' && path === '/api/state') return send(res, 200, state());

      if (req.method === 'GET' && path === '/api/profile') {
        const me = userById(String(req.headers['x-demo-user'] ?? ''));
        if (!me) throw new FlowError('Sign in first.', 401);
        return send(res, 200, { profile: profileOf(me), emailReady: !!process.env.RESEND_API_KEY?.trim() });
      }

      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(`retry: 2000\ndata: ${version}\n\n`);
        listeners.add(res);
        const beat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
        req.on('close', () => { clearInterval(beat); listeners.delete(res); });
        return;
      }

      const pdfMatch = path.match(/^\/api\/pills\/(PILL-\d{4})\/pdf$/);
      if (req.method === 'GET' && pdfMatch) {
        const me = userById(String(req.headers['x-demo-user'] ?? ''));
        if (!me) throw new FlowError('Sign in first.', 401);
        const pill = store.pills().find((p) => p.id === pdfMatch[1]);
        if (!pill) throw new FlowError('No such pill.', 404);
        let row = store.getPdf(pill.id);
        if (!row || !hasCurrentLayout(row.pdf)) {
          // Generate on demand if missing or made by an older layout.
          const pdf = await generatePillPdf(pill, titleLookup(store.pills()));
          store.putPdf(pill.id, pdf, new Date().toISOString());
          row = store.getPdf(pill.id);
        }
        const buf = Buffer.from(row!.pdf);
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="${pill.id}.pdf"`,
          'content-length': buf.length,
          'cache-control': 'no-store',
        });
        res.end(buf);
        return;
      }

      if (req.method !== 'POST') throw new FlowError('Not found.', 404);
      const actor = userById(String(req.headers['x-demo-user'] ?? ''));
      if (!actor) throw new FlowError('Sign in first.', 401);
      const body = await readJson(req);
      const now = new Date().toISOString();
      const log = (action: string, target: string, detail: string) =>
        store.log({ at: now, actor: actor.name, role: actor.role, action, target, detail });

      if (path === '/api/cases') {
        if (actor.role !== 'engineer') throw new FlowError('Only an engineer can open a case.', 403);
        const c = store.tx(() => {
          const created = newCase(store.nextCaseId(), actor.id, now);
          store.putCase(created);
          log('open', created.id, `Opened “${created.title}”.`);
          return created;
        });
        changed();
        return send(res, 201, { case: c, state: state() });
      }

      const caseAction = path.match(/^\/api\/cases\/(CASE-\d{4})\/actions$/);
      if (caseAction) {
        const current = store.cases().find((c) => c.id === caseAction[1]);
        if (!current) throw new FlowError('No such case.', 404);
        let action = body.action as Action;
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new FlowError('Missing action.', 400);
        let target = current;
        if (action.type === 'comment') {
          // Check everything cheap before spending a model call, and read one comment per case at a time.
          if (actor.role !== 'engineer' || current.engineerId !== actor.id) throw new FlowError('Only the engineer on this case can comment.', 403);
          if (current.status !== 'drafting') throw new FlowError("Comments can only change a pill that's being drafted.");
          const text = typeof action.text === 'string' ? action.text.trim() : '';
          if (!text || text.length > 1000) throw new FlowError('Write a comment of up to 1,000 characters.', 400);
          if (reading.has(current.id)) throw new FlowError('The agent is still reading your last comment.');
          const wait = checkModelLimit(actor.id);
          if (wait > 0) throw new FlowError(`Too many requests. Wait ${wait} seconds.`, 429);
          reading.add(current.id);
          try {
            const r = await readComment(text, { measures: current.measures, tuning: current.tuning });
            action = { type: 'comment', text, reading: r };
          } finally {
            reading.delete(current.id);
          }
          target = store.cases().find((c) => c.id === current.id) ?? current; // the plan may have moved while the agent read
        }
        const final = action;
        let changedPill: Pill | undefined;
        const saved = store.tx(() => {
          const out = applyAction(target, final, actor, new Date().toISOString(), store.pills());
          store.putCase(out.case);
          if (out.pill) {
            store.putPill(out.pill);
            changedPill = out.pill;
            // Chunk the pill for search/retrieval on approval or re-approval.
            try {
              store.putChunks(out.pill.id, chunkPill(out.pill));
            } catch (e) { console.warn(`Chunking ${out.pill.id} failed:`, e); }
          }
          if (final.type !== 'update') log(final.type, current.id, out.detail);
          return out.case;
        });
        // Regenerate after the commit succeeds, so a rollback never leaves an orphan and a re-approved revision never keeps its old PDF.
        if (changedPill) refreshPdf(changedPill);
        changed();
        if (final.type === 'submit' || final.type === 'approve' || final.type === 'return') deliver(caseMails(saved, final.type, people(), baseUrl(req)), saved.id);
        return send(res, 200, { state: state() });
      }

      if (path === '/api/sample') {
        if (actor.role !== 'manager') throw new FlowError('Only the manager can load a sample.', 403);
        store.tx(() => {
          const c = sampleCase(store.nextCaseId(), now, store.pills());
          store.putCase(c);
          log('sample', c.id, `Loaded a sample case issued for approval as revision ${c.revision}.`);
        });
        changed();
        return send(res, 200, { state: state() });
      }

      const rate = path.match(/^\/api\/pills\/(PILL-\d{4})\/rate$/);
      if (rate) {
        if (actor.role !== 'manager') throw new FlowError('Only the manager can rate a pill.', 403);
        const pill = store.pills().find((p) => p.id === rate[1]);
        if (!pill) throw new FlowError('No such pill.', 404);
        const rating = body.rating;
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
        if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) throw new FlowError('Rate the pill from 1 to 5 stars.', 400);
        if (!reason) throw new FlowError('Say why the rating changed.', 400);
        const updated: Pill = { ...pill, ratings: [...pill.ratings, { rating: rating as number, by: actor.name, reason, at: now.slice(0, 10) }] };
        store.tx(() => { store.putPill(updated); log('rate', pill.id, `Health set to ${rating} stars: ${reason}`); });
        refreshPdf(updated); // the PDF lists the health ratings
        changed();
        return send(res, 200, { state: state() });
      }

      if (path === '/api/ask') {
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        if (!question) throw new FlowError('Write a question.', 400);
        if (question.length > 1000) throw new FlowError('Keep the question under 1,000 characters.', 400);
        const wait = checkModelLimit(actor.id);
        if (wait > 0) throw new FlowError(`Too many requests. Wait ${wait} seconds.`, 429);
        const result = await ask(store, question, store.pills(), actor.role);
        const detail = result.answer.refused
          ? `Refused: ${result.answer.reason}`
          : `Answered (${result.answer.reader}${result.answer.fallbackReason ? ', fallback' : ''}) with ${result.answer.citations.length} citation(s).`;
        log('ask', 'library', `Q: "${question.slice(0, 200)}". ${detail}`);
        changed();
        const response: AskResponse = { answer: result.answer, question, at: now, actor: actor.name, role: actor.role };
        return send(res, 200, { ...response, state: state() });
      }

      if (path === '/api/profile') {
        const was = profileOf(actor);
        const next: Profile = { ...was };
        const changes: string[] = [];
        if (body.email !== undefined) {
          const email = typeof body.email === 'string' ? body.email.trim() : '';
          if (email && !isEmail(email)) throw new FlowError('That email address doesn’t look right.', 400);
          if (email !== was.email) { next.email = email; changes.push(email ? 'email' : 'removed email'); }
        }
        if (body.notify !== undefined) {
          if (typeof body.notify !== 'boolean') throw new FlowError('notify must be true or false.', 400);
          if (body.notify !== was.notify) { next.notify = body.notify; changes.push(body.notify ? 'emails on' : 'emails off'); }
        }
        if (body.photo !== undefined) {
          if (body.photo === null) { delete next.photo; changes.push('removed photo'); }
          else if (typeof body.photo !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo) || body.photo.length > 60_000) {
            throw new FlowError('Use a PNG, JPEG or WebP photo.', 400);
          } else if (body.photo !== was.photo) { next.photo = body.photo; changes.push('photo'); }
        }
        if (changes.length) {
          store.tx(() => { store.putProfile(actor.id, next); log('profile', actor.id, `Updated profile: ${changes.join(', ')}.`); });
          changed();
        }
        return send(res, 200, { profile: next, state: state() });
      }

      if (path === '/api/profile/test') {
        const me = profileOf(actor);
        if (!me.email) throw new FlowError('Add your email address first.', 400);
        const wait = 20_000 - (Date.now() - (lastTest.get(actor.id) ?? 0));
        if (wait > 0) throw new FlowError(`Wait ${Math.ceil(wait / 1000)} seconds before sending another test email.`, 429);
        lastTest.set(actor.id, Date.now());
        const r = await sendMail({
          to: me.email, toName: actor.name, subject: 'Test email from Intelligence Pills',
          heading: `Hello ${actor.name.split(' ')[0]}, your notifications work`,
          lines: [actor.role === 'manager'
            ? 'You will get an email here whenever an engineer issues a pill for your approval.'
            : 'You will get an email here whenever the manager approves or returns one of your pills.'],
          link: { href: `${baseUrl(req)}/profile?as=${actor.id}`, label: 'Open your profile' },
        });
        log('email', actor.id, r.ok ? `Sent ${actor.name} a test email.` : `Test email to ${actor.name} failed: ${r.error}`);
        changed();
        if (!r.ok) throw new FlowError(`The email didn't send: ${r.error}`, 502);
        return send(res, 200, { sent: true, state: state() });
      }

      if (path === '/api/reset') {
        store.reset(now, actor.name);
        await ensureSeedPdfs(store);
        changed();
        return send(res, 200, { state: state() });
      }

      throw new FlowError('Not found.', 404);
    } catch (e) {
      if (e instanceof FlowError) return send(res, e.status, { error: e.message, state: state() });
      console.error(e);
      return send(res, 500, { error: 'The pill server hit an error. Try again.' });
    }
  };
}
