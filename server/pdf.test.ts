// The PDF: every seeded pill generates, hostile text cannot break it, and the evidence is re-simulated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedPills, type Pill } from '../shared/flow.ts';
import { baseline, simulateMeasures } from '../shared/model.ts';
import { generatePillPdf, hasCurrentLayout, pillEvidence, requiredChecks, simulatedMeasures } from './pdf.ts';

const pills = seedPills();
const byId = (id: string) => pills.find((p) => p.id === id)!;
const pageCount = (pdf: Uint8Array) => (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;

test('every seeded pill makes a current-layout PDF of 3 to 6 pages', async () => {
  for (const p of pills) {
    const pdf = await generatePillPdf(p, pills);
    assert.equal(Buffer.from(pdf.subarray(0, 4)).toString('ascii'), '%PDF', p.id);
    assert.ok(hasCurrentLayout(pdf), `${p.id} carries the layout mark`);
    assert.ok(pageCount(pdf) >= 3 && pageCount(pdf) <= 6, `${p.id} has ${pageCount(pdf)} pages`);
  }
});

test('text the font cannot draw, very long words and many steps do not break generation', async () => {
  const hostile: Pill = {
    ...byId('PILL-0007'),
    title: 'Peak −5 kW ≥ cap → 日本語 😀',
    steps: Array.from({ length: 30 }, (_, i) => `Step ${i + 1}: ${'x'.repeat(300)} 日本語 😀 °C ≥ −`),
    guardrails: ['Stop if ' + 'y'.repeat(400)],
    knowHow: [{ question: '日本語?', answer: '😀 answer' }],
  };
  const pdf = await generatePillPdf(hostile);
  assert.equal(Buffer.from(pdf.subarray(0, 4)).toString('ascii'), '%PDF');
  assert.ok(pageCount(pdf) > 6, 'long content flows onto more pages instead of overflowing');
});

test('evidence is re-simulated for modelled pills and absent for the others', () => {
  for (const id of ['PILL-0007', 'PILL-0012']) {
    const ev = pillEvidence(byId(id))!;
    assert.ok(ev, `${id} has evidence`);
    assert.equal(ev.fix.peakKw, simulateMeasures(simulatedMeasures(byId(id))).peakKw);
    assert.equal(ev.base.peakKw, baseline().peakKw);
  }
  for (const id of ['PILL-0015', 'PILL-0004', 'PILL-0009']) assert.equal(pillEvidence(byId(id)), null, `${id} has no simulation evidence`);
});

test('required checks come from the library when the pill does not store them', () => {
  assert.deepEqual(requiredChecks(byId('PILL-0007'), pills), ['PILL-0015'], 'a chiller start-up change needs the electrical check');
  assert.deepEqual(requiredChecks(byId('PILL-0015'), pills), [], 'the check itself needs none');
  assert.deepEqual(requiredChecks({ ...byId('PILL-0007'), checks: [] }, pills), [], 'checks stored at approval win');
});

test('every seeded revision carries an approval record', () => {
  for (const p of pills) for (const r of p.revisions) assert.ok(p.approvals?.some((a) => a.rev === r.rev && a.by), `${p.id} rev ${r.rev}`);
});
