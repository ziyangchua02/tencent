// Engineer comments: offline reading, validation, applying to the plan, undo. Run with `npm test`.
// The Gemini key is cleared first so these tests never spend a real API call.
delete process.env.GEMINI_API_KEY;

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { applyReading, cleanReading, readWithRules } from '../shared/comments.ts';
import { applyAction, newCase, seedPills, USERS, type Case } from '../shared/flow.ts';
import { settingsFor, simulateMeasures } from '../shared/model.ts';
import { createApi } from './api.ts';
import { openStore } from './store.ts';

const engineer = USERS.find((u) => u.role === 'engineer')!;
const manager = USERS.find((u) => u.role === 'manager')!;
const now = '2026-10-04T08:00:00.000Z';
const pills = seedPills();
const sets = (text: string) => Object.fromEntries(readWithRules(text).changes.flatMap((c) => (c.kind === 'set' ? [[c.field, c.value]] : [])));

test('offline rules read times, gaps, charger counts and degrees', () => {
  assert.deepEqual(sets('On hot days start pre-cooling at 5:30, and only run 3 EV chargers from 10 to 4.'),
    { precoolStart: 5.5, evChargers: 3, evStart: 10, evEnd: 16 });
  assert.deepEqual(sets('Stagger the chillers 40 minutes apart.'), { staggerGapMin: 40 });
  assert.deepEqual(sets('Bring the AHUs on 30 min apart.'), { ahuGroupGapMin: 30 });
  assert.deepEqual(sets('Raise the setpoint by 1 degree.'), { setpointOffsetC: 1 });
});

test('offline rules switch measures off after a negation and keep conditions as notes', () => {
  const r = readWithRules("Don't raise the setpoint. On hot days start pre-cooling at 5:30. Check SB-1 with a multimeter first.");
  assert.ok(r.changes.some((c) => c.kind === 'disable' && c.measure === 'setpoint'));
  assert.ok(r.notes.some((n) => n.startsWith('On hot days')));
  assert.ok(r.notes.some((n) => n.includes('multimeter')));
});

test('model output is validated: unknown fields and out-of-range values never reach the plan', () => {
  const r = cleanReading({
    reply: 'ok',
    changes: [
      { kind: 'set', field: 'precoolStart', value: 3, quote: 'at 3am' },
      { kind: 'set', field: 'boilerTemp', value: 80, quote: 'boiler' },
      { kind: 'enable', measure: 'solarPanels', quote: 'solar' },
      { kind: 'set', field: 'evChargers', value: 2.6, quote: 'three-ish chargers' },
    ],
    notes: ['keep an eye on it', 42],
  }, 'gemini');
  assert.deepEqual(r.changes, [{ kind: 'set', field: 'evChargers', value: 3, quote: 'three-ish chargers' }]);
  assert.equal(r.ignored.length, 3);
  assert.match(r.ignored[0], /outside what the simulator covers/);
  assert.deepEqual(r.notes, ['keep an eye on it']);
});

test('a setting switches its measure on, and a window under an hour is refused', () => {
  const out = applyReading({ measures: [], tuning: {} }, readWithRules('Run EV charging from 11 to 11:30.'));
  assert.deepEqual(out.plan.measures, ['evShift']);
  assert.equal(out.plan.tuning.evStart, undefined);
  assert.match(out.ignored.join(' '), /under an hour/);
});

function drafted(): Case {
  const c = applyAction(newCase('CASE-0001', engineer.id, now), { type: 'runAgent' }, engineer, now, pills).case;
  return c;
}

test('a comment changes the plan and the simulation; undo puts it back', () => {
  const c = drafted();
  const reading = readWithRules('Only run 2 EV chargers.');
  const after = applyAction(c, { type: 'comment', text: 'Only run 2 EV chargers.', reading }, engineer, now, pills).case;
  assert.equal(after.tuning.evChargers, 2);
  assert.equal(after.simRuns, c.simRuns + 1);
  assert.equal(after.comments[0].applied[0].to, '2 chargers');
  // Fewer chargers deliver less energy: the simulation and the evidence both see it.
  assert.ok(simulateMeasures(after.measures, settingsFor(after.tuning)).evKwh < simulateMeasures(c.measures).evKwh);
  const undone = applyAction(after, { type: 'undoComment', id: after.comments[0].id }, engineer, now, pills).case;
  assert.deepEqual(undone.tuning, {});
  assert.equal(undone.comments.length, 0);
});

test('undo is refused once the plan has moved on, and only the engineer can comment', () => {
  const c = drafted();
  const after = applyAction(c, { type: 'comment', text: 'Stagger 40 minutes apart.', reading: readWithRules('Stagger the chillers 40 minutes apart.') }, engineer, now, pills).case;
  const moved = applyAction(after, { type: 'update', measures: ['precool', 'stagger'] }, engineer, now, pills).case;
  assert.throws(() => applyAction(moved, { type: 'undoComment', id: after.comments[0].id }, engineer, now, pills), /plan has changed/);
  assert.throws(() => applyAction(c, { type: 'comment', text: 'x', reading: readWithRules('x') }, manager, now, pills), { status: 403 });
  assert.throws(() => applyAction(c, { type: 'comment', text: 'no reading' }, engineer, now, pills), /not read this comment/);
});

test('HTTP: with no Gemini key the offline rules read the comment, and the evidence carries the tuning', async () => {
  const store = openStore(':memory:');
  const server = createServer((req, res) => createApi(store)(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, user: string, body: unknown = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-user': user }, body: JSON.stringify(body) });
  try {
    await post('/api/cases', engineer.id);
    await post('/api/cases/CASE-0001/actions', engineer.id, { action: { type: 'runAgent' } });
    assert.equal((await post('/api/cases/CASE-0001/actions', manager.id, { action: { type: 'comment', text: 'Start pre-cooling at 5:30.' } })).status, 403);
    // A client cannot smuggle in its own reading: the server replaces it.
    const fake = { reader: 'gemini', reply: '', changes: [{ kind: 'set', field: 'precoolStart', value: 4 }], notes: [], ignored: [] };
    const res = await post('/api/cases/CASE-0001/actions', engineer.id, { action: { type: 'comment', text: 'Start pre-cooling at 5:30.', reading: fake } });
    assert.equal(res.status, 200);
    const c = (await res.json()).state.cases[0] as Case;
    assert.equal(c.tuning.precoolStart, 5.5);
    assert.equal(c.comments[0].reader, 'rules');
    assert.match(c.comments[0].fallbackReason ?? '', /No Gemini key/);
    await post('/api/cases/CASE-0001/actions', engineer.id, { action: { type: 'update', confirmed: true } });
    const sent = await (await post('/api/cases/CASE-0001/actions', engineer.id, { action: { type: 'submit' } })).json();
    assert.equal(sent.state.cases[0].evidence.tuning.precoolStart, 5.5);
  } finally {
    server.close();
  }
});
