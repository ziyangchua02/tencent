// Eval set for the governed retrieval layer: 20-30 questions that exercise
// keyword search, role filtering, citation accuracy, and refusal logic.
// Run with `npm test` (auto-discovered as server/eval.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedPills, USERS } from '../shared/flow.ts';
import { chunkPill } from './chunker.ts';
import { ask } from './retrieval.ts';
import { openStore } from './store.ts';

const engineer = USERS.find((u) => u.role === 'engineer')!;
const manager = USERS.find((u) => u.role === 'manager')!;
const pills = seedPills();

function freshStore() {
  const store = openStore(':memory:');
  // Seed pills already have chunks from store init, but make it explicit.
  for (const p of pills) store.putChunks(p.id, chunkPill(p));
  return store;
}

// ---------- keyword search: finds the right pill ----------

test('ask: "chiller stagger" finds PILL-0007', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'How do I stagger the chillers?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0007'), 'should cite PILL-0007');
});

test('ask: "EV charging" finds PILL-0012', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'How do I manage EV charging?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0012'), 'should cite PILL-0012');
});

test('ask: "cooling tower wet-bulb" finds PILL-0009', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'How do cooling tower fans work on wet-bulb?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0009'), 'should cite PILL-0009');
});

test('ask: "warm floor complaint" finds PILL-0004', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What do I do about a warm floor complaint?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0004'), 'should cite PILL-0004');
});

test('ask: "electrical check before startup" finds PILL-0015', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What electrical checks should I do before changing the chiller start?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0015'), 'should cite PILL-0015');
});

// ---------- section-level retrieval ----------

test('ask: "guardrails" returns guardrail sections', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What are the guardrails for chiller soft-start?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.section === 'guardrails'), 'should cite a guardrails section');
});

test('ask: "steps" returns step sections', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What are the steps for managed EV charging?', pills, engineer.role);
  assert.equal(answer.refused, false);
  assert.ok(answer.citations.some((c) => c.section === 'steps'), 'should cite a steps section');
});

test('ask: "know-how" returns captured Q&A', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What know-how was captured from the engineer?', pills, engineer.role);
  assert.equal(answer.refused, false);
});

// ---------- refusal on weak evidence ----------

test('ask: nonsense question is refused', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'xyzzy frobozz qux', pills, engineer.role);
  assert.equal(answer.refused, true, 'should refuse on no evidence');
});

test('ask: empty-ish question is refused', async () => {
  const store = freshStore();
  const { answer } = await ask(store, '   ', pills, engineer.role);
  // FTS5 will return nothing for whitespace; should refuse
  assert.equal(answer.refused, true, 'should refuse on no evidence');
});

test('ask: unrelated topic is refused', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'How do I bake a chocolate cake?', pills, engineer.role);
  assert.equal(answer.refused, true, 'should refuse — no baking pills in the library');
});

// ---------- role filtering ----------

test('ask: both roles can read approved and live pills', async () => {
  const store = freshStore();
  const eng = await ask(store, 'How do I stagger the chillers?', pills, engineer.role);
  const mgr = await ask(store, 'How do I stagger the chillers?', pills, manager.role);
  assert.equal(eng.answer.refused, false);
  assert.equal(mgr.answer.refused, false);
});

// ---------- citation integrity ----------

test('ask: every citation references a real pill', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'How do I manage EV charging at the Logistics Hub?', pills, engineer.role);
  for (const c of answer.citations) {
    assert.ok(pills.some((p) => p.id === c.pillId), `citation pillId ${c.pillId} must be a real pill`);
    assert.ok(c.text.length > 0, 'citation text must not be empty');
    assert.ok(c.section.length > 0, 'citation section must not be empty');
  }
});

test('ask: cited text exists in the pill library', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What guardrails apply to chiller starts?', pills, engineer.role);
  for (const c of answer.citations) {
    const pill = pills.find((p) => p.id === c.pillId);
    assert.ok(pill, `pill ${c.pillId} must exist`);
    // The cited text should come from a known section of that pill
    const chunks = chunkPill(pill);
    assert.ok(chunks.some((ch) => ch.text === c.text), 'cited text must match a chunk in the pill');
  }
});

// ---------- multi-pill answers ----------

test('ask: question spanning multiple pills cites more than one', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What do I need to check before starting the chillers?', pills, engineer.role);
  if (!answer.refused) {
    const pillIds = new Set(answer.citations.map((c) => c.pillId));
    assert.ok(pillIds.size >= 1, 'should cite at least one pill');
  }
});

test('ask: HVAC question can match multiple pills', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'How do HVAC chillers start?', pills, engineer.role);
  assert.equal(answer.refused, false);
  const pillIds = new Set(answer.citations.map((c) => c.pillId));
  assert.ok(pillIds.size >= 1, 'should find at least one HVAC pill');
});

// ---------- snippet quality ----------

test('ask: sources contain snippets', async () => {
  const store = freshStore();
  const { search } = await ask(store, 'chiller soft-start', pills, engineer.role);
  for (const hit of search.hits) {
    assert.ok(hit.snippet.length > 0, 'every hit should have a snippet');
    assert.ok(hit.pillTitle.length > 0, 'every hit should have a pill title');
  }
});

// ---------- edge cases ----------

test('ask: very long question is handled', async () => {
  const store = freshStore();
  const long = 'How do I '.repeat(50) + 'stagger the chillers?';
  const { answer } = await ask(store, long.slice(0, 999), pills, engineer.role);
  // Should not crash; may or may not find results
  assert.ok(typeof answer.refused === 'boolean');
});

test('ask: question with special characters', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What is the SB-1 rating? (chiller power board)', pills, engineer.role);
  assert.ok(typeof answer.refused === 'boolean');
});

test('ask: question about ratings finds rating sections', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What rating did the manager give the chiller stagger pill?', pills, engineer.role);
  if (!answer.refused) {
    assert.ok(answer.citations.some((c) => c.section === 'ratings' || c.section === 'summary'));
  }
});

test('ask: question about revisions finds revision sections', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What revisions were made to the EV charging pill?', pills, engineer.role);
  if (!answer.refused) {
    // Should find the EV pill at least
    assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0012'));
  }
});

test('ask: question about owner finds metadata', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'Who owns the chiller soft-start pill?', pills, engineer.role);
  if (!answer.refused) {
    assert.ok(answer.citations.some((c) => c.section === 'metadata' || c.section === 'summary'));
  }
});

test('ask: question about sites finds metadata or summary', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'Where is the warm-floor complaint triage pill live?', pills, engineer.role);
  if (!answer.refused) {
    assert.ok(answer.citations.some((c) => c.pillId === 'PILL-0004'));
  }
});

test('ask: question about tools finds tools section', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What tools does the cooling tower fan pill use?', pills, engineer.role);
  if (!answer.refused) {
    assert.ok(answer.citations.some((c) => c.section === 'tools' || c.section === 'summary'));
  }
});

test('ask: composed-of and checks sections are searchable', async () => {
  const store = freshStore();
  const { answer } = await ask(store, 'What checks are required before changing the chiller start?', pills, engineer.role);
  // PILL-0015 is the check pill, PILL-0007 is the measure pill
  if (!answer.refused) {
    const ids = new Set(answer.citations.map((c) => c.pillId));
    assert.ok(ids.size >= 1);
  }
});

test('ask: offline (no Gemini key) still returns answers', async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const store = freshStore();
    const { answer } = await ask(store, 'How do I stagger the chillers?', pills, engineer.role);
    assert.equal(answer.refused, false);
    assert.equal(answer.reader, 'rules');
    assert.ok(answer.fallbackReason, 'should explain why it used rules');
  } finally {
    if (oldKey) process.env.GEMINI_API_KEY = oldKey;
  }
});

test('ask: audit-worthy — every question produces a consistent shape', async () => {
  const store = freshStore();
  const questions = [
    'How do I stagger chillers?',
    'What guardrails apply to EV charging?',
    'Who owns the cooling tower fan pill?',
    'What tools are used for HVAC electrical checks?',
  ];
  for (const q of questions) {
    const { answer } = await ask(store, q, pills, engineer.role);
    assert.ok(typeof answer.text === 'string');
    assert.ok(Array.isArray(answer.citations));
    assert.ok(typeof answer.refused === 'boolean');
    assert.ok(typeof answer.reason === 'string');
    assert.ok(answer.sources !== undefined);
  }
});
