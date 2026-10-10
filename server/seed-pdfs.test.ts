// Test that seeded pills always have a stored PDF on first start and after reset.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSeedPdfs, openStore } from './store.ts';
import { seedPills } from '../shared/flow.ts';

const SEEDED_IDS = seedPills().map((p) => p.id);

test('ensureSeedPdfs: all 5 seeded pills have a non-empty PDF starting with "%PDF"', async () => {
  const store = openStore(':memory:');
  await ensureSeedPdfs(store);
  for (const id of SEEDED_IDS) {
    const row = store.getPdf(id);
    assert.ok(row, `${id} should have a stored PDF`);
    const buf = Buffer.from(row.pdf);
    assert.ok(buf.length > 100, `${id} PDF should be non-empty`);
    assert.equal(buf.subarray(0, 4).toString('ascii'), '%PDF', `${id} PDF should start with "%PDF"`);
  }
});

test('ensureSeedPdfs: idempotent — second call does not regenerate or log', async () => {
  const store = openStore(':memory:');
  await ensureSeedPdfs(store);
  const auditBefore = store.audit().filter((e) => e.action === 'seed' && e.target === 'pdfs').length;
  await ensureSeedPdfs(store);
  const auditAfter = store.audit().filter((e) => e.action === 'seed' && e.target === 'pdfs').length;
  assert.equal(auditAfter, auditBefore, 'second call should not add a new audit row');
});

test('after reset(), all 5 seeded pills have a PDF again', async () => {
  const store = openStore(':memory:');
  await ensureSeedPdfs(store);
  store.reset(new Date().toISOString(), 'tester');
  await ensureSeedPdfs(store);
  for (const id of SEEDED_IDS) {
    const row = store.getPdf(id);
    assert.ok(row, `${id} should have a stored PDF after reset`);
    const buf = Buffer.from(row.pdf);
    assert.ok(buf.length > 100, `${id} PDF should be non-empty after reset`);
    assert.equal(buf.subarray(0, 4).toString('ascii'), '%PDF', `${id} PDF should start with "%PDF" after reset`);
  }
});
