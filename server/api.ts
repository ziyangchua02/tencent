// The JSON API. One handler, mounted by Vite in development and by server/main.ts in production.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  applyAction, FlowError, newCase, sampleCase, USERS, userById,
  type Action, type AppState, type Pill,
} from '../shared/flow.ts';
import { readComment } from './gemini.ts';
import type { Store } from './store.ts';

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

export function createApi(store: Store) {
  let version = 1;
  const reading = new Set<string>(); // cases with a comment being read right now
  const listeners = new Set<ServerResponse>();
  const changed = () => {
    version += 1;
    for (const res of listeners) res.write(`data: ${version}\n\n`);
  };
  const state = (): AppState & { users: typeof USERS } => ({
    version, users: USERS, cases: store.cases(), pills: store.pills(), audit: store.audit(),
  });

  return async function api(req: IncomingMessage, res: ServerResponse, next: Next) {
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    if (path === '/healthz') return send(res, 200, { ok: true });
    if (!path.startsWith('/api/')) return next();

    try {
      if (req.method === 'GET' && path === '/api/state') return send(res, 200, state());

      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(`retry: 2000\ndata: ${version}\n\n`);
        listeners.add(res);
        const beat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
        req.on('close', () => { clearInterval(beat); listeners.delete(res); });
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
        store.tx(() => {
          const out = applyAction(target, final, actor, new Date().toISOString(), store.pills());
          store.putCase(out.case);
          if (out.pill) store.putPill(out.pill);
          if (final.type !== 'update') log(final.type, current.id, out.detail);
        });
        changed();
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
        changed();
        return send(res, 200, { state: state() });
      }

      if (path === '/api/reset') {
        store.reset(now, actor.name);
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
