// Governance rules: run with `npm test`.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { applyAction, newCase, seedPills, USERS, type Action, type Case } from '../shared/flow.ts';
import { createApi } from './api.ts';
import { openStore } from './store.ts';

const engineer = USERS.find((u) => u.role === 'engineer')!;
const manager = USERS.find((u) => u.role === 'manager')!;
const now = '2026-10-04T08:00:00.000Z';
const pills = seedPills();
const act = (c: Case, a: Action, who = engineer) => applyAction(c, a, who, now, pills);

function issued(measures?: string[]) {
  let c = act(newCase('CASE-0001', engineer.id, now), { type: 'runAgent' }).case;
  if (measures) c = act(c, { type: 'update', measures }).case;
  c = act(c, { type: 'update', confirmed: true }).case;
  return act(c, { type: 'submit' }).case;
}

test('roles: the engineer cannot approve and the manager cannot edit the draft', () => {
  const c = issued();
  assert.throws(() => act(c, { type: 'approve', reason: 'ok', rating: 5 }), { status: 403 });
  assert.throws(() => act(newCase('CASE-0002', engineer.id, now), { type: 'update', problem: 'x' }, manager), { status: 403 });
});

test('sending needs an agent proposal, at least one measure and a confirmation', () => {
  const fresh = newCase('CASE-0001', engineer.id, now);
  assert.throws(() => act({ ...fresh, confirmed: true }, { type: 'submit' }), /Ask the agent/);
  const proposed = act(fresh, { type: 'runAgent' }).case;
  assert.throws(() => act(proposed, { type: 'submit' }), /Confirm the pill/);
  assert.throws(() => act({ ...proposed, measures: [], confirmed: true }, { type: 'submit' }), /at least one measure/);
});

test('the agent proposal leaves SB-1 above 90% for the engineer, and the server re-simulates the evidence', () => {
  const c = issued();
  assert.deepEqual(c.measures, ['precool', 'stagger', 'ahuGroups', 'evShift']);
  assert.equal(c.agent?.clear, false);
  assert.equal(c.evidence?.verdicts[2], 'concern');
  assert.equal(c.status, 'submitted');
  assert.equal(c.evidence?.baselinePeakKw, 3150);
  assert.equal(c.evidence?.peakKw, 2600);
  assert.equal(c.evidence?.authority, 'approve');
});

test('a board over its rating escalates: the manager cannot approve, only return', () => {
  const c = issued(['precool']);
  assert.equal(c.evidence?.authority, 'escalate');
  assert.throws(() => act(c, { type: 'approve', reason: 'fine', rating: 4 }, manager), /Escalated to the Head of Technical Services/);
  assert.equal(act(c, { type: 'return', reason: 'Add the stagger.' }, manager).case.status, 'returned');
});

test('approval needs a reason and a 1-5 rating, then creates a pill; execute makes it live', () => {
  const c = issued();
  assert.throws(() => act(c, { type: 'approve', reason: ' ', rating: 4 }, manager), /reason is required/);
  assert.throws(() => act(c, { type: 'approve', reason: 'Good', rating: 6 }, manager), /1 to 5/);
  assert.throws(() => act(c, { type: 'execute' }, manager), /isn't available/);
  const approved = act(c, { type: 'approve', reason: 'Clear evidence.', rating: 4 }, manager);
  assert.equal(approved.pill?.id, 'PILL-0016');
  assert.equal(approved.pill?.ratings.at(-1)?.rating, 4);
  assert.deepEqual(approved.pill?.composedOf, ['PILL-0007', 'PILL-0012']);
  assert.deepEqual(approved.pill?.checks, ['PILL-0015']);
  const live = applyAction(approved.case, { type: 'execute' }, manager, now, [...pills, approved.pill!]);
  assert.equal(live.case.status, 'live');
  assert.deepEqual(live.pill?.sites, ['Tower A']);
});

test('rejected work loops back: comments, redo, resubmit as the next revision', () => {
  const returned = act(issued(), { type: 'return', reason: 'Explain the EV wait.' }, manager).case;
  assert.throws(() => act(returned, { type: 'update', problem: 'x' }), /returned for changes/);
  const redo = act(returned, { type: 'redo' }).case;
  const again = act(act(redo, { type: 'update', confirmed: true }).case, { type: 'submit' }).case;
  assert.equal(again.revision, 2);
  assert.equal(again.decisions[0].reason, 'Explain the EV wait.');
});

test('HTTP: mutations need a known user, roles are enforced, every action is logged', async () => {
  const store = openStore(':memory:');
  const server = createServer((req, res) => createApi(store)(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, user?: string, body: unknown = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-demo-user': user } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/api/cases')).status, 401);
    assert.equal((await post('/api/cases', manager.id)).status, 403);
    assert.equal((await post('/api/cases', engineer.id)).status, 201);
    assert.equal((await post('/api/cases/CASE-0001/actions', manager.id, { action: { type: 'runAgent' } })).status, 403);
    assert.equal((await post('/api/cases/CASE-0001/actions', engineer.id, { action: { type: 'runAgent' } })).status, 200);
    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.deepEqual(state.audit.map((e: { action: string }) => e.action), ['runAgent', 'open', 'seed']);
  } finally {
    server.close();
  }
});
