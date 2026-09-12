# Design — MOS Aftercare Workbench diagrams

Diagrams for the flow described in [`docs/PRD.md`](../docs/PRD.md) and implemented in
[`aftercare-workbench/`](../aftercare-workbench).

Each diagram exists as a pair:
- **`uml/*.puml`** — the UML source (PlantUML syntax). Authoritative, plain text, easy
  to diff and edit. Render it yourself at https://www.plantuml.com/plantuml or with a
  local PlantUML install/plugin if you want to regenerate the `.svg` after an edit.
- **`svg/*.svg`** — a hand-built rendering of the same diagram, kept visually
  consistent with the app's own colour palette (`aftercare-workbench/public/styles.css`).
  Open these directly (double-click, or drag into a browser tab) — no tooling required.

| # | Diagram | Type | File |
|---|---|---|---|
| 01 | End-to-end flow | Activity diagram | [`uml/01-end-to-end-flow.puml`](uml/01-end-to-end-flow.puml) · [`svg/01-end-to-end-flow.svg`](svg/01-end-to-end-flow.svg) |
| 02 | Guided web form — ticket creation | Sequence diagram | [`uml/02-sequence-guided-web-form.puml`](uml/02-sequence-guided-web-form.puml) · [`svg/02-sequence-guided-web-form.svg`](svg/02-sequence-guided-web-form.svg) |
| 03 | Voice intake — extraction & safety gate | Sequence diagram | [`uml/03-sequence-voice-intake.puml`](uml/03-sequence-voice-intake.puml) · [`svg/03-sequence-voice-intake.svg`](svg/03-sequence-voice-intake.svg) |
| 04 | Data model | Class diagram | [`uml/04-class-diagram-data-model.puml`](uml/04-class-diagram-data-model.puml) · [`svg/04-class-diagram-data-model.svg`](svg/04-class-diagram-data-model.svg) |
| 05 | Ticket lifecycle | State diagram | [`uml/05-state-diagram-ticket-lifecycle.puml`](uml/05-state-diagram-ticket-lifecycle.puml) · [`svg/05-state-diagram-ticket-lifecycle.svg`](svg/05-state-diagram-ticket-lifecycle.svg) |
| 06 | System architecture | Component diagram | [`uml/06-component-diagram-architecture.puml`](uml/06-component-diagram-architecture.puml) · [`svg/06-component-diagram-architecture.svg`](svg/06-component-diagram-architecture.svg) |

## Reading order

Start with **01** for the full customer-to-resolution journey, then **02**/**03** for
how each intake channel talks to the server, **04** for the shape of the data, **05**
for what happens to a ticket after it's created, and **06** for how the pieces are
deployed and why (zero-dependency Node + vanilla JS — see PRD §10, "Why this stack").

## A note on the `.svg` files

They're hand-authored, not exported from a PlantUML renderer — so they won't be
pixel-identical to what `plantuml.com` produces from the matching `.puml`, but they
carry the same structure, states, and decision logic. If you edit a `.puml` file,
treat the `.svg` as needing a matching manual update (or render the `.puml` yourself
and swap it in).
