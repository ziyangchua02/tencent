// HTTP layer tests: call the api handler with fake req/res and an in-memory store.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApi } from './api.ts';
import { openStore } from './store.ts';
import { USERS } from '../shared/flow.ts';

const ENGINEER = USERS.find((u) => u.role === 'engineer')!.id;
const MANAGER = USERS.find((u) => u.role === 'manager')!.id;

function makeStore() { return openStore(':memory:'); }

function fakeReq(method: string, url: string, body: unknown | null, headers: Record<string, string> = {}): any {
  const bodyStr = body === null ? null : JSON.stringify(body);
  const bodyBuf = bodyStr ? Buffer.from(bodyStr) : null;
  return {
    method,
    url,
    headers: { 'x-demo-user': ENGINEER, ...headers },
    [Symbol.asyncIterator]: async function* () {
      if (bodyBuf) yield bodyBuf;
    },
    on: (_e: string, _fn: () => void) => {},
  };
}

function fakeRes(): any {
  const chunks: Buffer[] = [];
  return {
    _status: 0,
    _headers: {} as Record<string, string>,
    _ended: false,
    writeHead(status: number, headers?: Record<string, string>) { this._status = status; if (headers) Object.assign(this._headers, headers); },
    write(chunk: string | Buffer) { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); },
    end(chunk?: string | Buffer) { this._ended = true; if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); },
    get body() { return Buffer.concat(chunks).toString('utf8'); },
    get raw() { return Buffer.concat(chunks); },
    get json() { try { return JSON.parse(this.body); } catch { return null; } },
    _headersSent: false,
  };
}

function noop() {}

async function callApi(store: ReturnType<typeof makeStore>, method: string, url: string, body: unknown | null = null, headers: Record<string, string> = {}): Promise<any> {
  const api = createApi(store);
  const req = fakeReq(method, url, body, headers);
  const res = fakeRes();
  await api(req, res, noop);
  return res;
}

async function callApiWith(api: any, _store: ReturnType<typeof makeStore>, method: string, url: string, body: unknown | null = null, headers: Record<string, string> = {}): Promise<any> {
  const req = fakeReq(method, url, body, headers);
  const res = fakeRes();
  await api(req, res, noop);
  return res;
}

test('missing x-demo-user returns 401 on POST endpoints', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/cases', { action: { type: 'update' } }, { 'x-demo-user': '' });
  assert.equal(res._status, 401);
});

test('missing x-demo-user returns 401 on GET /api/pills/:id/pdf', async () => {
  const res = await callApi(makeStore(), 'GET', '/api/pills/PILL-0007/pdf', null, { 'x-demo-user': '' });
  assert.equal(res._status, 401);
});

test('engineer cannot approve (role check via applyAction)', async () => {
  const store = makeStore();
  // Create a case and submit it first as engineer.
  const open = await callApi(store, 'POST', '/api/cases', {}, { 'x-demo-user': ENGINEER });
  assert.equal(open._status, 201);
  const caseId = open.json.case.id;
  // Engineer tries to approve — should be 403 from applyAction.
  const res = await callApi(store, 'POST', `/api/cases/${caseId}/actions`, { action: { type: 'approve', reason: 'looks good' } }, { 'x-demo-user': ENGINEER });
  assert.equal(res._status, 403);
});

test('engineer cannot rate a pill (403)', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/pills/PILL-0007/rate', { rating: 5, reason: 'great' }, { 'x-demo-user': ENGINEER });
  assert.equal(res._status, 403);
});

test('engineer cannot load a sample (403)', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/sample', {}, { 'x-demo-user': ENGINEER });
  assert.equal(res._status, 403);
});

test('/api/reset has no role check — engineer can reset (BUG: flagged, not fixed)', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/reset', {}, { 'x-demo-user': ENGINEER });
  // Today the code allows any authenticated user to reset. This is a bug.
  assert.equal(res._status, 200, 'engineer can reset — this is a known bug, not fixed here');
});

test('comment on a non-drafting case is refused', async () => {
  const store = makeStore();
  // Manager loads a sample case (goes straight to 'submitted').
  const sample = await callApi(store, 'POST', '/api/sample', {}, { 'x-demo-user': MANAGER });
  assert.equal(sample._status, 200);
  const caseId = sample.json.state.cases[0].id;
  // Engineer tries to comment on a submitted case — should fail (409: conflict, wrong state).
  const res = await callApi(store, 'POST', `/api/cases/${caseId}/actions`, { action: { type: 'comment', text: 'change setpoint to 25' } }, { 'x-demo-user': ENGINEER });
  assert.equal(res._status, 409);
  assert.match(res.json.error, /drafted/i);
});

test('rating outside 1-5 is refused', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/pills/PILL-0007/rate', { rating: 7, reason: 'too good' }, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 400);
  assert.match(res.json.error, /1 to 5/i);
});

test('rating 0 is refused', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/pills/PILL-0007/rate', { rating: 0, reason: 'bad' }, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 400);
});

test('body over 64 KB returns 413', async () => {
  const store = makeStore();
  const big = 'x'.repeat(70 * 1024);
  const res = await callApi(store, 'POST', '/api/pills/PILL-0007/rate', { rating: 5, reason: big }, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 413);
});

test('GET /api/pills/:id/pdf returns application/pdf starting with %PDF', async () => {
  const store = makeStore();
  // Seed pills already have PDFs from openStore, but let's just fetch one.
  const res = await callApi(store, 'GET', '/api/pills/PILL-0007/pdf', null, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 200);
  assert.equal(res._headers['content-type'], 'application/pdf');
  assert.equal(res.raw.subarray(0, 4).toString('ascii'), '%PDF');
});

test('manager can rate a pill', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/pills/PILL-0007/rate', { rating: 4, reason: 'solid pill' }, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 200);
});

test('manager can load a sample', async () => {
  const res = await callApi(makeStore(), 'POST', '/api/sample', {}, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 200);
});

test('GET /api/state returns 200 with pills', async () => {
  const res = await callApi(makeStore(), 'GET', '/api/state', null, {});
  assert.equal(res._status, 200);
  assert.ok(res.json.pills.length >= 5);
});

test('rate limit: 11th /api/ask within a minute returns 429', async () => {
  const store = makeStore();
  const api = createApi(store);
  for (let i = 0; i < 10; i++) {
    const res = await callApiWith(api, store, 'POST', '/api/ask', { question: 'test question ' + i }, { 'x-demo-user': MANAGER });
    assert.equal(res._status, 200, `call ${i + 1} should succeed`);
  }
  // 11th call should be rate-limited
  const res = await callApiWith(api, store, 'POST', '/api/ask', { question: 'one too many' }, { 'x-demo-user': MANAGER });
  assert.equal(res._status, 429);
  assert.match(res.json.error, /Too many requests/i);
});
