// Notification emails and profiles over HTTP. Resend is replaced by a stub, so no real email is sent.
process.env.RESEND_API_KEY = 're_test';
process.env.MANAGER_EMAIL = 'manager@example.com';
delete process.env.ENGINEER_EMAIL;
delete process.env.APP_URL;
delete process.env.GEMINI_API_KEY;

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApi } from './api.ts';
import { openStore } from './store.ts';

const realFetch = globalThis.fetch;
const sent: { to: string[]; subject: string; text: string }[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'stub' }), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

const settle = async (n: number) => { for (let i = 0; i < 50 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 10)); };

test('issuing emails the manager, returning emails the engineer, and addresses never reach other browsers', async () => {
  const store = openStore(':memory:');
  const server = createServer((req, res) => createApi(store)(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = async (path: string, user: string, body: unknown = {}) => {
    const res = await realFetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-user': user }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const act = (user: string, action: unknown) => post('/api/cases/CASE-0001/actions', user, { action });
  try {
    await post('/api/cases', 'wei_ming');
    await act('wei_ming', { type: 'runAgent' });
    await act('wei_ming', { type: 'update', confirmed: true });
    await act('wei_ming', { type: 'submit' });
    await settle(1);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ['manager@example.com']);
    assert.match(sent[0].subject, /CASE-0001 needs your approval/);
    assert.match(sent[0].text, /\/review\/CASE-0001\?as=priya/);

    // The public state carries photos but no email addresses; the owner's profile page does.
    const state = await (await realFetch(`${base}/api/state`)).json();
    assert.ok(!JSON.stringify(state.users).includes('@'));
    const mine = await (await realFetch(`${base}/api/profile`, { headers: { 'x-demo-user': 'priya' } })).json();
    assert.equal(mine.profile.email, 'manager@example.com');

    // The engineer has no address yet, so returning sends nothing until they add one.
    await act('priya', { type: 'return', reason: 'Explain the EV wait.' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sent.length, 1);
    assert.equal((await post('/api/profile', 'wei_ming', { email: 'not-an-email' })).status, 400);
    assert.equal((await post('/api/profile', 'wei_ming', { photo: 'data:text/html;base64,PHA+' })).status, 400);
    assert.equal((await post('/api/profile', 'wei_ming', { email: 'engineer@example.com' })).status, 200);
    await act('wei_ming', { type: 'redo' });
    await act('wei_ming', { type: 'update', confirmed: true });
    await act('wei_ming', { type: 'submit' });
    await act('priya', { type: 'return', reason: 'Still unclear.' });
    await settle(3);
    assert.deepEqual(sent.map((m) => m.to[0]), ['manager@example.com', 'manager@example.com', 'engineer@example.com']);
    assert.match(sent[2].text, /Still unclear/);

    // Turning emails off stops them; the audit log records each email without the address.
    await post('/api/profile', 'priya', { notify: false });
    await act('wei_ming', { type: 'redo' });
    await act('wei_ming', { type: 'update', confirmed: true });
    await act('wei_ming', { type: 'submit' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sent.length, 3);
    const audit = (await (await realFetch(`${base}/api/state`)).json()).audit as { action: string; detail: string }[];
    assert.ok(audit.some((e) => e.action === 'email' && /Emailed Priya Nair/.test(e.detail)));
    assert.ok(!audit.some((e) => e.detail.includes('@')));
  } finally {
    server.close();
  }
});
