# MOS Mechanical — Aftercare Workbench (prototype)

A working demonstrator of the guided intake form, triage rules engine and AI
voice-intake assistant described in [`docs/PRD.md`](../docs/PRD.md).

## Run it

No build step, no npm dependencies to install — this is plain Node.

```bash
node server/index.js
```

Then open http://localhost:4173

Set `PORT=xxxx` to use a different port.

## What's here

```
server/
  index.js       HTTP server: static files + JSON API, zero npm dependencies
  reference.js   Fault types, priorities/SLAs, parties, states — the policy config
  triage.js      The triage rules engine (pure function: site + report -> decision)
  classifier.js  Stub "AI" extractor for the voice-intake demo (see PRD for the
                 production swap-in plan — same interface, real ASR/LLM behind it)
  data.js        Seed data standing in for the house/warranty spreadsheet
  store.js       In-memory store with write-through persistence to data/tickets.json
  session.js     Stub user/permissions list, shared by index.js and api/[...path].js
public/
  index.html, styles.css, app.js   Vanilla JS UI, no framework, no bundler
api/
  [...path].js   Vercel serverless entry point — same routes as server/index.js's
                 handleApi(), reusing the same reference/triage/classifier/store
                 modules unchanged. Only needed for the Vercel deployment below.
```

## Why this stack

MOS Mechanical has no in-house software team. A plain Node server and a
dependency-free frontend mean:
- `git clone` + `node server/index.js` is the entire deployment.
- Any competent IT generalist (or a managed service desk) can read every file.
- Nothing to keep patched except Node itself.

See "Why this stack" in the PRD for the full rationale and the trade-offs accepted.

## Demo script

There's no separate demo tab — every tab demos and explains itself in place, via
its own **"▶ Demo: …"** button(s) at the top:

- **Aftercare Queue** — "▶ Run demo: explain this ticket" selects a good example
  ticket (preferring one with missing evidence or a repeat-fault flag) and narrates
  what the priority/party badges and rule explanation mean. It's a toggle: click a
  different ticket while it's on and the narration follows your selection, so it
  never goes stale. "Reset demo data" clears everything created during the demo and
  restores the original two sample tickets.
- **New Ticket (Guided Form)** — three buttons run the intake end-to-end (pick the
  house, fill the fault, submit) and land the result inline on the same tab:
  *data-gap safeguard* (`Grainne Lynch`, no commissioning date → routed to
  back-office rather than guessing warranty status), *manufacturer warranty claim*
  (`Aidan Byrne`, heat pump fault `E4`, still in parts warranty), and *chargeable
  repair* (`Sean & Orla Whelan`, out of warranty, no service contract).
- **Voice Intake** — two buttons run the extraction end-to-end: *confident match*
  (a clean transcript naming the customer, fault and phone number) and *safety gate*
  (any mention of gas/CO, showing the action gets blocked regardless of confidence).
- **Overview** — "▶ Run demo: explain these numbers" narrates the current stat
  cards using live counts, so it stays accurate as tickets are created elsewhere.

Each of these can also be driven by hand instead — search for a site, fill in the
form, or paste a transcript yourself. "Reset demo data" is available on every tab.
