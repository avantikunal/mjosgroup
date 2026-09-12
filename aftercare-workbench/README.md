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
public/
  index.html, styles.css, app.js   Vanilla JS UI, no framework, no bundler
```

## Why this stack

MOS Mechanical has no in-house software team. A plain Node server and a
dependency-free frontend mean:
- `git clone` + `node server/index.js` is the entire deployment.
- Any competent IT generalist (or a managed service desk) can read every file.
- Nothing to keep patched except Node itself.

See "Why this stack" in the PRD for the full rationale and the trade-offs accepted.

## Demo script

1. **Aftercare Queue** — open a ticket, read the rule that fired and why, note the
   "missing evidence" and "repeat fault" flags.
2. **New Ticket (Guided Form)** — search `Grainne Lynch` (site with no commissioning
   date on file) and log a fault; note it routes to back-office for manual
   verification rather than guessing a warranty decision.
3. **New Ticket (Guided Form)** — search `Aidan Byrne`, log a heat pump fault with
   error code `E4`; note it's assigned to the manufacturer warranty queue.
4. **Voice Intake** — paste or speak: *"Hi it's Maura Kelly, no hot water since this
   morning, my number is 087 555 0102"* and click Extract details, then Review in
   guided form.
5. **Voice Intake (safety gate)** — paste: *"I think I can smell gas near the boiler"*
   and click Extract details — note the action is blocked with an emergency-handling
   instruction instead of a ticket draft.
