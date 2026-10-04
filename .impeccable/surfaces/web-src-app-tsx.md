---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: []
---

# Surface brief: Intelligence Pills web app (all routes)

Scope: the whole two-role app (login, engineer case wizard, manager review, pill library, audit log). Visitor mode: Operate.
Audience and job: see PRODUCT.md. Engineer goes problem -> pills + simulation loop -> agent questions -> confirm and send. Manager reviews evidence -> approve with star rating (= pill health) then execute, or reject with comments -> engineer redoes.
Constraints: standard web controls and navigation; synthetic data labelled; keyboard and phone width.

## Direction contract

THESIS: Every pill is an issued engineering drawing. The switchboard single-line diagram is the working surface, the title block carries identity and sign-offs, the revision table is version history, and drawing stamps are the status vocabulary. It refuses the SaaS card dashboard of icon tiles and hero metrics.

OWN-WORLD: Cool plot-white paper, drawing-black ink, hairline 1px rules framing viewports instead of shadowed cards. Prussian-blue shell band. Today's state drawn thin grey ("existing"), the proposal drawn bold blue ("proposed"), changes ringed by red revision clouds with a numbered revision triangle. Status as rubber stamps in words: PRELIMINARY, ISSUED FOR APPROVAL, RETURNED WITH COMMENTS, APPROVED, LIVE. Barlow for UI, Barlow Semi Condensed caps for title-block labels and table heads, tabular figures for every number.

STORY: The engineer sees why Tower A breaches its cap on the load drawing, watches the agent assemble a fix from approved pills and domain practice, sees every change re-simulated and clouded on the drawing, answers the reviewer's questions, and issues it. The manager reads the same drawing, the three agents' verdicts and the evidence, then stamps it approved with a rating, or returns it with comments.

FIRST VIEWPORT: Login: left two-thirds a full single-line diagram of Tower A at the 08:00 peak with SB-1 clouded red "over rating"; right third the two sign-in role cards (Engineer, Asset Operations Manager) stacked, primary action on each. Inside the app: Prussian top band with product name, nav (Cases or Review queue, Pill library, Audit log), persona and reset; below, a horizontal step list, then the drawing panel (single-line diagram + load profile) beside the agent panel; the title block docks at the bottom-right of each case.

FORM: Electrical drawing sheet (load drawings), impeccable's pick, ranked first on the grounded list; seed key 7c80bdfc. Signature move: revision clouds draw themselves around every board or schedule row the proposal changes; stamp lands on decision.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: Head of Technical Services sign-off path is a label only (no login).
