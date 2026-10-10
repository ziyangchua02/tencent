# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + TypeScript frontend and a dependency-free Node (TypeScript, built-in `node:sqlite`) server in one repo, deployed as one container. Chosen by the user on 2026-10-04 so the power simulation is shared code: the browser previews it, the server re-runs it as the evidence of record.

## Users

- **Engineer** (demo persona: Wei Ming Tan, Senior M&E Engineer, Tower A). Has a recurring site problem and the hands-on know-how to fix it. Job: define the problem, let the agent propose a governed fix from existing pills and domain knowledge, check it in simulation, answer the agent's questions, and send it for approval.
- **Asset Operations Manager** (demo persona: Priya Nair). Supervises several buildings. Job: review proposed solutions with their evidence, approve (then execute) or reject with comments, and rate each approved pill.
- **Hackathon judges** (Keppel + Tencent Cloud) evaluate the live demo in about three minutes.

## Product Purpose

Turn a senior engineer's undocumented fix into a reusable, governed "Intelligence Pill" that any building can apply safely. Success: an engineer gets from a problem to a manager-approved, executed pill in one sitting, and the manager can see exactly why it is safe before saying yes.

## Positioning

Not a chatbot or a search box. The agent assembles a fix from approved pills plus general domain knowledge, re-simulates the building on every change, asks the questions a reviewer would, and cannot release anything without a named manager's reasoned approval. Board-overload results escalate automatically and cannot be approved at manager level.

## Operating Context

Keppel track of the Tencent Cloud "AI CAN DO IT" Hackathon Singapore 2026 (case study: AI HARVEST, Energy Optimisation). Workflow from the user's whiteboard:

1. Define problem, showing the load drawings.
2. Agent searches the pill database (existing pills + general domain knowledge) and proposes a solution.
3. Simulation of the proposal; the engineer tweaks and re-runs (loop back to step 2).
4. Agent asks more questions.
5. Engineer confirms and sends to the manager.
6. Manager approves, then executes; or rejects with comments, and the engineer redoes it. Approval is always required ("if confident, no need approval" was struck out).
7. Manager rates the pill; the rating is the pill's health.

Engineers do not write pills by hand ("engineer write pill" was struck out). Two windows (one per role) should see each other's changes live.

## Capabilities and Constraints

- One synthetic building, Tower A: 20 floors, 3,000 kW contracted capacity, main switchboard + four sub-boards, three chillers. A piecewise-linear 96-step weekday demand model (not a thermal model).
- Five measures (pre-cool, chiller stagger, AHU groups, managed EV charging, setpoint +0.5 °C) and two out-of-scope ideas (thermal storage, battery).
- Three review agents (Energy, Tenant Experience, Technical Services) give support / concern / block. A board over 100 % escalates to the Head of Technical Services and disables approval.
- Pill health = the manager's 1–5 star rating only (user decision, 2026-10-04).
- Certification is out of scope (user decision, 2026-10-04).
- The agent reads engineer comments with Google Gemini (default `gemini-3.5-flash`; `gemini-2.5-flash` is no longer offered to new keys, `gemini-3.8-flash` failed on demand errors on 2026-10-05) and falls back to offline rules when no key is set or the call fails. The library question endpoint (`/api/ask`) uses Gemini for both semantic search (text embeddings, cosine similarity re-ranking) and answer synthesis, with a keyword-only fallback. All Gemini paths share a per-user rate limit of 10 model calls per minute.

## Evidence on Hand

- The source artifact (https://claude.ai/artifact/MqUx2886ZaobQkJ27TsTSN): simulation model, measures, agent logic, sample engineer transcript and answers.
- The user's whiteboard transcription (in the request of 2026-10-04), including an example HVAC pill: conditions of equipment, exposed wires → arrangement, tool: multimeter.
- All people, buildings, readings and tariffs are synthetic. Nothing is Keppel data. Do not invent customers, savings claims or real tariffs.

## Product Principles

1. People decide; the agent proposes and explains.
2. Every number is re-simulated, never typed in.
3. Show the evidence before asking for the decision.
4. Know-how is captured as a reusable pill, not a one-off answer.
5. Label synthetic data wherever it could be mistaken for real.

## Accessibility & Inclusion

Judged on "UX and Accessibility": keyboard-operable wizard and charts, visible focus, text alternatives for every chart, colour never the only signal (status words beside colour), works at phone width.

## Governance Rules

- Reviewers: three review agents (Energy, Tenant Experience, Technical Services) each give support, concern or block.
- Escalation: a board over 100% of its rating escalates to the Head of Technical Services and disables manager approval. The plan ranking treats an over-rating board as worse than any number of warnings.
- Required checks: pills tagged `checkFor` become mandatory checks. Example: PILL-0015 (HVAC electrical check) runs before any chiller start-up change on SB-1.
- Audit log: append-only, enforced by SQLite triggers. Only the demo reset clears it, and the new log records that.
- Out of scope: certification; thermal storage and battery.

## Domain Model (Tower A)

- 20 floors, 3,000 kW contracted capacity, MSB (3,300 kW) plus SB-1 chillers (820), SB-2 floors 1–10 (900), SB-3 floors 11–20 (900), SB-4 lifts and car park (500). SB-1 is deliberately sized so the agent's plan still leaves it near 96% and the engineer's own setpoint raise clears it (demo story).
- Demand: piecewise-linear weekday curve, 96 steps of 15 minutes. Not a thermal model.
- Measures: pre-cool, chiller stagger, AHU groups, managed EV charging, setpoint +0.5 °C.
- Nine tunable settings (`TUNING_FIELDS`), each with a validated range: precoolStart, staggerGapMin, ahuGroupGapMin, evStart, evEnd, evChargers, setpointOffsetC, setpointStart, setpointEnd. An engineer's comment can change them.
- Tariff: synthetic ($0.28/kWh, $15 per kW above contracted).

## Workflow Detail

Case state machine: `drafting → submitted → returned | approved → live`. Every transition goes through `applyAction` (`shared/flow.ts`) inside a DB transaction and writes an audit row. Returned cases go back to drafting for the engineer to redo.

Comment reading: the engineer's free-text comment is read by Gemini (default `gemini-3.5-flash`; `gemini-2.5-flash` is no longer offered to new keys, `gemini-3.8-flash` failed on demand errors on 2026-10-05) or by offline rules when there is no key or the call fails. Output always passes through `cleanReading()` and can only be `enable`, `disable` or `set` within valid ranges, plus notes for anything the simulator cannot model. A measure the comment proposes joins the plan unticked, tagged "Added by me", drawn in violet on the load chart and board diagram. One comment per case is read at a time; comments are only accepted while drafting, from the case's own engineer.

Pill library search (`searchLibrary`): each existing pill is matched to the selected measures as `measure` (carries it), `check` (required guard), `related` (same system) or `none`.

Pill library Q&A (`POST /api/ask`): questions are answered from approved and live pills only, using hybrid search (FTS5 keyword candidates, re-ranked by Gemini `gemini-embedding-001` cosine similarity when a key is set; chunk vectors are fetched in one batch call and cached in `embed_cache`) and answer synthesis (Gemini when a key is set, rules-based otherwise). Every answer cites the pill chunks it came from and carries an evidence-match confidence.

Confidence guard (`judge()` in `server/retrieval.ts`, thresholds in `shared/retrieval-types.ts`): a question is refused unless the evidence is clearly about it. With embeddings: similarity ≥ 0.72 is accepted, 0.69 to 0.72 is accepted only if at least half of the question's meaningful words appear in the evidence, and under 0.69 is refused. Without embeddings (no key, or embedding failed): at least 50% of the meaningful words must appear. Calibrated on 18 questions against the five seeded pills (real questions 0.70 to 0.82; off-topic questions sharing one word 0.64 to 0.67), so re-check the cutoffs when the library grows. The confidence is shown under the answer and written to the audit log.

Pill PDFs: every approved pill gets a PDF generated after the DB transaction commits. Seeded pills have PDFs generated on first start and after reset (`ensureSeedPdfs`). `GET /api/pills/:id/pdf` serves the stored PDF, or generates one on demand as a fallback.

PDF layout (`server/pdf.ts`): each pill prints as a controlled document in the style of a corporate standard operating procedure. A4, Liberation Sans embedded via `@pdf-lib/fontkit` (files in `server/assets/`), 4 to 6 pages.

- **Every page:** a bordered header (system name, document type and title, document number, revision and status, page X of Y), a classification strip reading "SYNTHETIC DEMONSTRATION DATA · NOT KEPPEL DATA", and a footer with the print date and "Uncontrolled when printed. Controlled version: <link>" (`APP_URL` + `/pills/<id>`; the path alone when `APP_URL` is unset).
- **Control page:** title and summary; a document control table (number, type, revision, status, effective date, health, owner, domain, system, sites, classification, originating case); an approval table (prepared by, reviewed by, approved by, with title, date and record); the revision history with who approved each revision; a contents list with page numbers; and an "uncontrolled when printed" notice.
- **Numbered sections:** 1 Purpose (with the engineer's problem statement for pills made from a case), 2 Scope and applicability, 3 Definitions and abbreviations (only the terms the pill uses), 4 Roles and responsibilities, 5 Related documents (required checks, source pills, originating case, related pills), 6 Simulated effect on Tower A (chart as Figure 1, simulated figures as Table 1, the three review agents' verdicts and findings as Table 2), 7 Prerequisites (authorisation, required checks, tools), 8 Guardrails, 9 Settings (each tunable value, its permitted range and the measure it belongs to; only for pills the simulator models), 10 Procedure (steps with initials and time columns), 11 Monitoring and review (health rating history), 12 Records.
- **Appendices:** captured know-how (when the pill has any) and an execution record form (site, date, revision used, carried out by, verified by, signatures, deviations and notes).

Where the content comes from: the section 6 figures are re-simulated from `shared/model.ts` when the PDF is made (`Pill.measureId`, or `Pill.measures` + `Pill.tuning` for pills made from a case), never stored. Pills the simulator does not model (PILL-0015, PILL-0004, PILL-0009) say "Not applicable" there and have no Settings section. "Approved by" comes from `Pill.approvals`, written when a manager approves a revision; the seeded pills carry synthetic approvals by the manager persona on each revision's date. "Reviewed by" appears only for pills made from a case, because that is the only review on record. Required checks are the ones stored at approval, or library pills whose `checkFor` tags match (`requiredChecks`). Text the font lacks (CJK, emoji) prints as `?` rather than failing. Each PDF carries a layout marker (`hasCurrentLayout`), so `ensureSeedPdfs` and the download route regenerate PDFs made by an older layout. A PDF is regenerated after the transaction commits whenever a pill is approved or re-approved, and when it is rated.

Seed pills: PILL-0007 chiller soft-start and stagger, PILL-0012 managed EV charging window, PILL-0015 HVAC electrical check before a start-up change (required check), PILL-0004 warm-floor complaint triage, PILL-0009 cooling tower fans on wet-bulb.

## Architecture

One repo, one container. React 19 + Vite + TypeScript front end; dependency-free Node ≥22.18 server with built-in `node:sqlite`.

```
shared/   pure TS, runs in browser AND server
  model.ts             simulator, measures, TUNING_FIELDS, review agents, recommend()
  flow.ts              Pill, Case, USERS, seedPills, searchLibrary, applyAction (state machine)
  comments.ts          Reading/ProposedChange types, offline rules reader, cleanReading()
  retrieval-types.ts   Chunk, SearchHit, Citation, Answer, AskRequest, AskResponse
server/
  main.ts      entry (static site + API, port 8080)
  api.ts       GET /api/state, /api/profile, /api/events (SSE), /api/pills/:id/pdf;
               POST /api/cases, /api/cases/:id/actions, /api/sample, /api/ask, /api/profile(/test), /api/reset
  store.ts     SQLite: docs(kind,id,json) for cases/pills/profiles; append-only audit table; chunks + FTS5 index; pdf_store; ensureSeedPdfs()
  static.ts    static file serving from dist/ with path-traversal protection
  gemini.ts    comment reader (Gemini, falls back to rules)
  retrieval.ts governed retrieval: role/status filtering, answer synthesis, citations, refusal on weak evidence
  search.ts    hybrid search: FTS5 keyword + optional Gemini embeddings (cosine similarity)
  chunker.ts   chunks pill JSON by section for FTS5 indexing
  pdf.ts       generates a PDF from a pill's JSON using pdf-lib
  email.ts     Resend HTTP notifications
web/src/       App, engineer, manager, library, profile, casekit, drawings, state, ui
```

Design decisions:
- Shared simulation: the browser previews it live; the server re-runs it as the evidence of record.
- Live updates: each state change bumps a version pushed over SSE, so two windows (one per role) stay in sync.
- Auth: none. The `x-demo-user` header names the persona.
- Persistence: cases and pills are JSON documents. Profiles survive a demo reset; the reset reseeds the five synthetic pills. Seeded pills get a PDF generated on first start and after reset via `ensureSeedPdfs`, so they are always available for download without waiting for approval.
- Pill PDFs: every approved pill gets a PDF generated after the transaction commits (so a rollback never leaves an orphan). The `GET /api/pills/:id/pdf` endpoint serves stored PDFs, generating on demand as a fallback. Uses `pdf-lib` (pure JS, no native bindings).
- Library Q&A: `POST /api/ask` answers questions from the pill library using governed retrieval — hybrid search (FTS5 keyword + optional Gemini embeddings), role/status filtering, citation-backed answers, and refusal on weak evidence.
- Rate limiting: Gemini paths (`/api/ask` and comment reading) share a per-user limit of 10 model calls per minute, returning 429.
- Email: Resend notifies the manager on submit and the engineer on approve or return. Each send is audit-logged without the address. Addresses are returned only to their owner.
- The Gemini key stays on the server.

## Run and Deploy

- `npm run dev` (port 5173), `npm test`, `npm run build && npm start` (port 8080).
- Render free tier from the `Dockerfile` (sleeps after 15 min idle, disk wiped, demo reseeds), or `./deploy.sh user@ip` for a Lighthouse server (Docker, port 80, `pills-data` volume).
- Env: `GEMINI_API_KEY`, `GEMINI_MODEL`, `RESEND_API_KEY`, `MANAGER_EMAIL`, optional `ENGINEER_EMAIL`, `EMAIL_FROM`.

## Known Issues

- No real login: anyone with the link can reset data or spend Gemini quota (rate-limited to 10 model calls per minute per user, but still no auth wall).
- Plain HTTP on the server IP; HTTPS needs a domain.
- The Resend key only delivers to its account owner until a domain is verified and `EMAIL_FROM` is set.
- Render free tier loses profile changes when the instance sleeps.
- The Tencent Lighthouse free trial was unavailable on the user's account, hence Render.
- `POST /api/reset` has no role check: any signed-in persona can wipe the demo data. Fine for a demo, not for anything shared.
- Library page tables hide the System, Captured-from and Live-at columns at phone width (CSS only, to avoid sideways scrolling); the full values are on the pill's page.
- CJK text in a pill prints as `?` in its PDF (Liberation Sans has no CJK glyphs). Embedding Noto Sans CJK would fix it at several MB.
- Pills stored before 2026-10-10 have no `approvals`, `measures` or `problem` fields, so their PDF shows "Approved by: not recorded" and no simulation. Resetting the demo data reseeds the library with them.
- The PDF is not a tagged (accessible-structure) PDF: `pdf-lib` cannot write one. It has a title and language set, and its text is in reading order.

## Testing

`npm test` runs 73 tests (all passing at last check) in `server/*.test.ts`: governance and flow (`flow.test.ts`), comment reading (`comments.test.ts`), email (`email.test.ts`), HTTP layer and role checks (`api.test.ts`), static serving (`static.test.ts`), seeded PDFs (`seed-pdfs.test.ts`), the PDF layout, hostile text and re-simulated evidence (`pdf.test.ts`) and retrieval quality (`eval.test.ts`). `npm run typecheck` is clean. There are no browser or accessibility tests yet.

## Done on 2026-10-10 (this pass)

- Fixed the Pill-and-questions step (wizard step 2): an expanded measure card ("Why it helps, trade-off and chart") no longer slides under the sticky simulation panel. Cause: `.measures` was a grid with no column limit, so the expanded chart stretched the track to 786 px inside a 483 px column; now `grid-template-columns: minmax(0, 1fr)` and `min-width: 0`. Checked at 1280 and 375 px, no sideways scroll.
- Fixed the regression where a re-approved pill kept its old PDF, and made rating a pill regenerate its PDF (test in `api.test.ts`).
- Fixed the `/api/ask` answer timeout: `signal` was inside the JSON body in `retrieval.ts`, so it never applied.
- Redesigned the PDF as a controlled document in the style of a corporate standard operating procedure (see "Pill PDFs"), with `pdf.test.ts`. `Pill` gained optional `approvals`, `problem`, `measures` and `tuning` fields to feed it.
- Added the question-answering confidence guard and the embedding cache (see "Workflow Detail").

## Planned Work

- Accessibility pass of the web app with Playwright at phone and desktop widths (only the pill-related screens were checked so far).
- Optionally restrict `/api/reset` to the manager; today any signed-in persona can wipe the demo data.
