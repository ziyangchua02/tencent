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
- The agent is deterministic in this build; an LLM hook exists for later.

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
