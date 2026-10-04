// The agent's reader for engineer comments: Google Gemini when GEMINI_API_KEY is set,
// the offline rules otherwise or when Gemini fails. The key never leaves the server.
import { cleanReading, readWithRules, type Plan, type Reading } from '../shared/comments.ts';
import {
  currentValue, describeValue, MEASURE_IDS, MEASURES, settingsFor, TUNING_FIELDS, TUNING_IDS,
} from '../shared/model.ts';

const SYSTEM = `You are the planning agent in "Intelligence Pills", helping a building engineer tune a weekday
morning start-up plan for Tower A, a synthetic 20-floor office tower. The engineer writes a comment.
Turn it into changes the simulator can run, and nothing else.

Rules:
- Only change what the comment clearly asks for. Never invent changes.
- "set" changes one setting to a number. Times are 24-hour decimal hours (5:30 am = 5.5, 4 pm = 16).
- "enable" or "disable" switches a whole measure on or off. Setting a value on an Off measure switches it on by itself.
- Give each change a "quote": the engineer's exact words that justify it.
- Anything the simulator cannot model (weather conditions, staffing, inspections, who to notify) goes in "notes",
  in the engineer's own words, shortened to one sentence each. Conditions like "on hot days" belong in notes too.
- "reply" is one short, plain sentence to the engineer saying what you changed or why you couldn't.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    changes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['enable', 'disable', 'set'] },
          measure: { type: 'STRING', enum: MEASURE_IDS, nullable: true },
          field: { type: 'STRING', enum: TUNING_IDS, nullable: true },
          value: { type: 'NUMBER', nullable: true },
          quote: { type: 'STRING' },
        },
        required: ['kind', 'quote'],
      },
    },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['reply', 'changes', 'notes'],
};

function describePlan(plan: Plan) {
  const s = settingsFor(plan.tuning);
  const measures = MEASURES.map((m) => `- ${m.id}: "${m.title}" (${plan.measures.includes(m.id) ? 'On' : 'Off'})`).join('\n');
  const fields = TUNING_IDS.map((f) => {
    const meta = TUNING_FIELDS[f];
    return `- ${f}: ${meta.meaning}. Belongs to ${meta.measure}. Now ${describeValue(f, currentValue(f, s))}. Allowed ${meta.min} to ${meta.max}${meta.unit === 'time' ? ' (decimal hours)' : ''}.`;
  }).join('\n');
  return `Measures:\n${measures}\n\nSettings you may change:\n${fields}`;
}

async function askGemini(text: string, plan: Plan, key: string): Promise<Reading> {
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `${describePlan(plan)}\n\nEngineer's comment:\n"""${text}"""` }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
    signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!out) throw new Error('empty answer');
  return cleanReading(JSON.parse(out), 'gemini');
}

export async function readComment(text: string, plan: Plan): Promise<Reading> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ...readWithRules(text), fallbackReason: 'No Gemini key is set on the server.' };
  try {
    return await askGemini(text, plan, key);
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out' : e.message) : 'unknown error';
    console.warn(`Gemini comment reading failed (${why}); used the offline rules.`);
    return { ...readWithRules(text), fallbackReason: `Gemini didn't answer (${why}).` };
  }
}
