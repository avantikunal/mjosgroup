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

The app opens on a **Demo Walkthrough** tab with five one-click scenario cards —
each sets up a scenario end-to-end and jumps to where the result lands, with a
"say this" line and a "watch for this" line for whoever is presenting. A **Reset
demo data** button on that tab clears anything created during the demo and restores
the original two sample tickets, so it can be re-run as many times as needed.

The five scenarios (also runnable by hand, if you'd rather drive manually):

1. **Data-gap safeguard** — search `Grainne Lynch` (site with no commissioning date
   on file) and log a fault; note it routes to back-office for manual verification
   rather than guessing a warranty decision.
2. **Manufacturer warranty claim** — search `Aidan Byrne`, log a heat pump fault
   with error code `E4`; note it's assigned to the manufacturer warranty queue.
3. **Chargeable repair** — search `Sean & Orla Whelan` (out of warranty, no service
   contract) and log an intermittent heating fault; note it's flagged chargeable.
4. **Voice Intake** — paste or speak: *"Hi it's Maura Kelly, no hot water since this
   morning, my number is 087 555 0102"* and click Extract details, then Review in
   guided form.
5. **Voice Intake (safety gate)** — paste: *"I think I can smell gas near the boiler"*
   and click Extract details — note the action is blocked with an emergency-handling
   instruction instead of a ticket draft.
