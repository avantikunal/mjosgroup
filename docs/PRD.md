# PRD — MOS Mechanical Aftercare Triage & Intake

**Status:** Draft for stakeholder review
**Owner:** Product (drafted with Claude, for review by MOS Mechanical operations)
**Last updated:** 2026-09-17
**Related:** [`aftercare-workbench/`](../aftercare-workbench) — working prototype implementing this PRD · [`Design/`](../Design) — UML + SVG diagrams of the flow

**Source documents** (MOS Mechanical / MJOS Group, Innovation Exchange submission — this PRD and the prototype are built directly from these, not from an independently invented process):
- *MOS Mechanical Aftercare Pitch* (Owen Boyle, Group Operations Manager, MJOS Group)
- *MOS Aftercare Problem Summary*
- *Aftercare Call Triage Guide*
- *Aftercare Call Guide — within 1 year warranty*
- *Aftercare Call Guide — over 1 year warranty*
- *Heat Pump Decision Tree*

---

## 1. Problem statement

In Owen Boyle's own words: *"The decision in the middle is the hard part."* MOS Mechanical installs heating, plumbing and renewables into new-build housing schemes across Leinster. Around 2,500 houses are handed over and now sitting inside or just outside their warranty period, generating 35–50 aftercare calls a week from homeowners and builders. Before any call is useful as a ticket, MOS has to establish five things: **who and where** the caller is, **what the fault** actually is, **when the house was commissioned**, **whether it is still inside warranty**, and **which of five parties** should deal with it — MOS's own plumbing team, the builder, a chargeable visit, a manufacturer (Heat Merchants) warranty claim, or advice that avoids a visit altogether.

The triage rules to make that decision already exist and are correct — the *Aftercare Call Triage Guide* and *Heat Pump Decision Tree* are printed and in use in the office today. The problem is what those rules need in order to work, and MOS's own problem summary and pitch name it precisely:

1. **Phone calls have to be typed up.** An email becomes a ticket on its own; a phone call only becomes one if whoever took it writes it up afterwards.
2. **The homeowner doesn't have the answers.** Commissioning date, warranty status, service history and previous calls on the house are MOS's data, not the caller's — and MOS's own ticketing system doesn't hold it either. It sits in certificates and spreadsheets.
3. **The detail arrives too late.** Error codes, photos and serial numbers are chased after the call, or a technician is sent out without them.
4. **It runs on who is on the phone.** The decision trees are correct, but on a busy morning they aren't always followed.
5. **Wasted call-outs.** A plumber turns up to a builder's roof leak, or a chargeable job gets done for nothing.
6. **Nothing moves out of hours.** Calls after five go to voicemail until the next working day.
7. **No visibility into the pattern.** No view of call volumes, which houses keep coming back, or which products keep failing.
8. **Recharges get missed.** Call-outs the builder is liable for aren't consistently captured or invoiced.

## 2. Goals

1. Every aftercare ticket is created with house-specific data (system, commissioning date, warranty status, builder, service history) attached automatically — not looked up ad hoc from a certificate or spreadsheet.
2. Triage decisions (assigned party, chargeable status, who gets billed) are made by MOS's own documented rules, consistently, regardless of who took the call or how busy the day was.
3. Tickets aren't created missing the evidence (photos, error codes, serial numbers, service certificates) a fault type needs — the intake flow makes collecting it the easy path.
4. Heat pump faults are never auto-finalised: a senior plumber always confirms whether a fault is MOS's own hydraulic-side responsibility or a Heat Merchants supplier warranty matter, per the Heat Pump Decision Tree's error-code guide.
5. Repeat call-outs at the same house become visible ("which houses we keep going back to"), instead of being logged as N unrelated visits.
6. An AI-assisted voice/phone intake path exists that produces the same structured, triaged record a web form would — reviewed by a person before a ticket is finalised, never auto-committed.
7. Chargeable work is flagged at the point of triage, with **who pays** (the builder or the homeowner) captured correctly, so the recharge position at month end doesn't rely on memory.

### Non-goals (for this phase)

- Replacing MOS's own ticketing and scheduling system — that already works and this sits in front of it, handing off a complete record (see §12, integration).
- Fully autonomous AI dispatch with no human in the loop — every heat pump decision, and every chargeable decision, stays reviewable by a person before it's acted on.
- Building the actual Heat Merchants warranty-logging integration, or the phone-system/AI-voice telephony layer itself — this prototype defines the contract those would plug into (see §9).

## 3. Users

| Persona | Role | What they need from this |
|---|---|---|
| Office Admin | Answers phones / processes the web form | A single place that shows house history and produces a correctly-triaged ticket without a manual certificate/spreadsheet lookup |
| Senior Plumber | Signs off heat pump routing decisions | The error code, serial number and service-certificate status in hand before deciding hydraulic-side vs. supplier warranty |
| Field Technician | Attends the job | A ticket that already says what's covered, what evidence exists, and why |
| Builder / Snagging contact | Handles snagging-checklist items and builder-warranty recharges | Clear separation of what's the builder's responsibility vs. MOS's, and an accurate monthly recharge position |
| Owen Boyle (Group Operations Manager) | Owns aftercare outcomes across MJOS Group | Consistent, auditable triage; visibility into repeat faults and recharge revenue; the same process working for MSM Renewables and Home Comfort Retrofits too |
| Homeowner | Reports the fault | A faster, guided way to report (day or night) and a correct, early expectation of whether the visit is chargeable |

## 4. Current vs. future process

**Today** ("What has to happen on every call", Pitch p.4): take the customer and the fault → work out what the issue is → find the commissioning date → check in/out of warranty → raise a ticket and schedule it. Every step depends on a person doing it correctly from memory, using certificates and spreadsheets MOS's own ticketing system doesn't hold.

**Future (this PRD):** customer uses the web form, or a voice intake is transcribed → the system finds the house record automatically → a guided, fault-specific questionnaire collects the evidence a technician or supplier claim actually needs → MOS's own documented triage rules decide the party, the charge status, and who pays → a complete ticket lands in the same queue MOS already runs, whichever channel it came from.

## 5. Solution overview

Three parts, all implemented in the prototype:

1. **A house/asset record** holding what today lives in certificates and spreadsheets: builder, system type, commissioning date, and (for heat pumps) whether the current call's service certificates have been supplied.
2. **A triage rules engine** — a pure function of (house record, fault report) → (assigned party, chargeable status, who pays, explanation), implementing MOS's own *Aftercare Call Triage Guide*, its two warranty-specific call guides, and the *Heat Pump Decision Tree* exactly. Same inputs always produce the same decision, and every decision names the rule and quotes the source guide it came from (§7).
3. **Two intake paths that feed the same engine:**
   - A **guided web form**: search the house → see its warranty position immediately → a fault-specific questionnaire (the builder/snagging checklist for leaks; error code, serial number and service-certificate confirmation for heat pumps) collects exactly what the triage rule needs.
   - A **voice/phone intake assistant**: a transcript is run through an extractor that proposes a fault type, a matched house, any error code, and flags likely builder/snagging language — always shown to a person for confirmation before a ticket is created.

## 6. The five fault categories (as documented)

Taken directly from the *Aftercare Call Triage Guide*'s "What is the main issue?" step — MOS's own categories, not an invented taxonomy:

| Category | Examples (from the guide) | Evidence requested |
|---|---|---|
| Leak / Water Ingress | Radiator leak, pipe leak, cylinder leak, overflow, damp/water stains | Photos / videos |
| No Heating | No heating upstairs/downstairs, radiators cold, underfloor heating issue | Error codes & photos of controller |
| No Hot Water | No hot water, water not hot enough, running out quickly | Error codes & photos of controller |
| Heat Pump Error / Fault | Error code showing, heat pump not heating, noise/leaking, outdoor unit issue | Error code, serial number & photo of display |
| Other Query / Advice | How to use system, settings questions, general queries | None — resolved with guidance |

## 7. Triage rules (as implemented, cited to source)

Rules are evaluated in order; the first match decides the outcome.

| Rule | Condition | Party | Chargeable | Billed to | Source |
|---|---|---|---|---|---|
| `RULE_GUIDANCE_ONLY` | Fault type is Other Query / Advice | Customer Guidance | No | — | Triage Guide: "Provide Guidance/Advice... Resolve if possible" |
| `RULE_MISSING_COMMISSIONING_DATE` | No commissioning date on file | Office — Warranty Verification Needed | Unknown | — | Triage Guide, Important Reminders: "Always check warranty date before sending anyone" |
| `RULE_BUILDER_SNAGGING` | Leak matches the snagging checklist (roof leak, shower tray seal, external drain, building-fabric ingress, skylight/window leak) | Builder / Snagging Team | — | Builder | Triage Guide: "Not our plumbing responsibility" — applies **regardless of warranty status** |
| `RULE_HEATPUMP_SERVICE_CERTS_REQUIRED` | Heat pump, error code starts with F (refrigerant), no service certs supplied yet | Heat Merchants (pending) | Unknown | — | Heat Pump Decision Tree error-code guide: "F- or F Gas = Warranty Call Required"; Pitch: cover "only stands up if the annual service has been done and certified" |
| `RULE_HEATPUMP_SUPPLIER_WARRANTY` | Heat pump, F-code, service certs supplied | Heat Merchants — Supplier Warranty Claim | No | — | Heat Pump Decision Tree |
| `RULE_WITHIN_MOS_WARRANTY` | Within MOS's 1-year plumbing warranty (or heat pump H-code / unclear code within that period) | MOS Plumbing Team | No | — | Call Guide — within 1 year: "All calls within 1 year of commissioning go to our Plumbing Team first" |
| `RULE_BUILDER_WARRANTY_RECHARGE` | Past MOS's 1-year warranty, but within the builder's own (often longer) warranty | MOS Plumbing Team | Yes | **Builder** | Call Guide — within 1 year, Important reminder: "Builders Warranties are longer than our 1 year Plumbing Warranty — call outs during this period are chargeable to the Builder" |
| `RULE_OUT_OF_WARRANTY_CHARGEABLE` | Past both MOS's and the builder's warranty | Plumber to Review — Chargeable | Yes | **Homeowner** | Call Guide — over 1 year: "Plumber attendance after 1 year is chargeable unless covered by a Heat Pump warranty" |

**Every heat pump ticket** is also flagged `requiresSeniorPlumberSignOff = true`, regardless of which rule fired — the Heat Pump Decision Tree never lets warranty status alone decide; a senior plumber always confirms hydraulic-side vs. supplier-warranty before dispatch.

**Repeat-fault visibility** (not warranty-gated): a second or later ticket against the same house is flagged, addressing Problem #7 directly — "we cannot see... which houses we keep returning to."

**Evidence gating**: a ticket that's missing a fault type's required evidence (photo, error code, serial number, or — for a Heat Merchants claim — service certificates) is marked `dataQuality: incomplete` rather than silently accepted, addressing Problem #3.

## 8. Data model

**Site/house record**: `siteId, customerName, phone, email, address, eircode, builderName, builderWarrantyMonths, systemType, manufacturer, modelNumber, serialNumber, commissioningDate, mosWarrantyMonths`.

Two fields are the direct fix for the stated problem: `builderName` + `builderWarrantyMonths` capture the fact that *"at times, Builders Warranties are longer than our 1 year Plumbing Warranty"* — without it, a chargeable job would be billed to the wrong party by default. `commissioningDate` (not install date) is what every warranty clock in this PRD runs from; a house with no commissioning date on file is exactly the data gap `RULE_MISSING_COMMISSIONING_DATE` exists to catch rather than paper over.

**Ticket record**: `ticketId, siteId, channel, reportedBy, builderIfKnown, faultTypeId, errorCode, serialNumber, photos[], symptoms, leakChecklist{}, serviceCertsProvided, openedAt, state, priority, assignedParty, chargeable, chargeParty, ruleId, explanation, requiresSeniorPlumberSignOff, dataQuality, missingFields[], repeatFault, repeatFaultCount`.

Full field definitions: [`server/data.js`](../aftercare-workbench/server/data.js), [`server/triage.js`](../aftercare-workbench/server/triage.js).

## 9. AI voice assistant — how it works, and how it doesn't

The prototype's voice intake (`server/classifier.js`) is a deliberately simple, regex/keyword-based extractor, versioned as `voice-intake-stub-classifier-2026-09-01` — not a call to a real speech or language model. It exists to prove out the **interface** a real ASR/LLM pipeline (the "AI voice [that] picks up for the people who will ring no matter what, and holds a normal conversation instead of a menu" — Pitch p.6) would need to satisfy: `transcript → { faultType, errorCode + its Heat-Pump-Decision-Tree meaning, matched site, leak-checklist keyword hits, requiresHumanReview }`. Because the triage engine and the UI only depend on that schema, a real model should drop in behind the same route without changing anything downstream.

Guardrails worth carrying into a production build unchanged:
- **No autonomous ticket creation.** Every voice-drafted ticket is confirmed through the same guided form a human-logged call goes through — "Form or phone, it produces the same record."
- **Heat pump routing is never fully automatic**, no matter how good the model gets — a senior plumber signs off per the Heat Pump Decision Tree, always.
- **A kill switch to disable AI-drafted extraction instantly**, falling back to fully manual intake without a deploy.

## 10. Why this stack

The prototype is plain Node on the server and dependency-free vanilla JavaScript on the client — no framework, no build step. MOS has no in-house software team, and a system like this will likely be run and lightly maintained by a generalist IT contact or a managed service provider; `git clone` + `node server/index.js` being the entire deployment, with every file plainly readable, is worth more here than the productivity a framework buys a dedicated engineering team. Revisit this if MOS staffs an in-house dev team or the UI's scope grows substantially.

The same reasoning drives two more choices: ticket data persists to a plain JSON file rather than a database (fine at MOS's call volume; revisit if it grows), and the UI renders all customer-supplied text as DOM text nodes rather than HTML, closing off stored XSS from a crafted fault description or transcript without a sanitization library.

## 11. Success metrics

Directly from the pitch's own "What good would look like" / "Expected outcomes":

| Metric | Why it matters |
|---|---|
| % of aftercare calls captured through the form vs. by phone vs. missed out-of-hours | "Every call captured... any hour of the day" |
| % of tickets whose party/charge decision matches the documented rule (vs. a manual override) | "The same answer every time... does not change with who took the call" |
| Wasted call-outs (technician attends, wrong party or missing evidence) | The pitch's own headline cost: "our plumber turns up to a builder's roof leak" |
| Recharge revenue captured — chargeable-to-builder vs. chargeable-to-homeowner, reported monthly | "Chargeable work recovered... invoiced at month end" — this PRD's Overview screen models exactly this split |
| Houses/products triggering 2+ calls, tracked over time | "Something to learn from... fed back into how we build" |
| Time senior plumbers and office staff spend on phone triage | "Time back for the people we need on site" |

## 12. Integration required for a production build

Named directly in the pitch (p.7) — this prototype stands in front of all of these but integrates with none of them yet:

- MOS's own ticketing and scheduling system (built in-house) — this prototype would hand off a complete record to it rather than replacing it
- The MOS website, where the aftercare form should live
- Commissioning and certification records — today certificates and spreadsheets; this PRD's site record is what they'd migrate into
- The existing Aftercare Tracker
- MOS's office phone system (for the AI voice path)
- Microsoft 365 / SharePoint, where project and property files live
- The Heat Merchants supplier warranty logging process

## 13. Phased rollout

- **Phase 0 (this deliverable):** working prototype — guided form, triage engine matching MOS's own documented rules, voice-intake demo, seed data standing in for the real house/warranty records.
- **Phase 1:** migrate the real commissioning/warranty/builder data into the site record schema; pilot the guided web form with office admins on live calls.
- **Phase 2:** integrate ticket creation with MOS's actual ticketing/scheduling system and the Aftercare Tracker, retiring duplicate manual entry.
- **Phase 3:** replace the stub classifier with a real speech-to-text + LLM extraction pipeline behind the same interface; connect to the office phone system.
- **Phase 4:** extend to MSM Renewables and Home Comfort Retrofits, per the pitch's own closing point that "the same process would run" for both.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Builder warranty terms vary by scheme and aren't yet in any system MOS holds | `builderWarrantyMonths` is a per-site field precisely so this can be populated scheme-by-scheme during Phase 1 migration, rather than assumed |
| Heat Merchants' actual warranty-logging requirements may go beyond "service certificates supplied" | `RULE_HEATPUMP_SERVICE_CERTS_REQUIRED` models the one gate MOS's own documents name; validate against Heat Merchants' real process before Phase 2 |
| Error-code prefix rules (H-/F-) are documented for Panasonic only | Confirm whether other installed brands (Vaillant, Worcester Bosch, Mitsubishi Ecodan) use comparable prefixes, or need their own guide, before relying on this for non-Panasonic heat pumps |
| Voice extraction (once real) misclassifies a builder/snagging item as MOS's responsibility | Snagging-keyword detection is intentionally broad and surfaced as a flag for human confirmation, not an automatic routing decision |
| Office admins route around the tool under call pressure | Keep the override path fast (an MOS Plumbing Team member can reassign with a recorded reason) so correcting a wrong decision is easier than working around the tool |

## 15. Open questions for MOS stakeholders

1. Does MOS's own ticketing/scheduling system expose an API or webhook for Phase 2, or would this need a manual export/import initially?
2. What is the actual process for logging a warranty call with Heat Merchants — a portal, a phone line, an email template — and what beyond service certificates do they require?
3. Do all builder warranties get captured anywhere today (contracts, defects-liability schedules), or would `builderWarrantyMonths` need to be populated scheme-by-scheme from scratch?
4. Is the H-/F- error-code convention specific to Panasonic, or do Vaillant, Worcester Bosch and Mitsubishi Ecodan (all named in the pitch/seed data) have their own equivalent codes MOS already relies on?
5. Who is "Richie" (named in the Heat Pump Decision Tree as the scheduling contact) meant to be in a production system — a fixed person, a role, or a rotation? Should the workbench name a scheduling contact per fault type generally?
6. Is call recording/transcription for the AI voice path already covered under existing customer consent, or does it need its own consent flow?
