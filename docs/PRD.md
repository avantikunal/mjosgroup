# PRD — MOS Mechanical Aftercare Triage & Intake

**Status:** Draft for stakeholder review
**Owner:** Product (drafted with Claude, for review by MOS Mechanical operations)
**Last updated:** 2026-09-11
**Related:** [`aftercare-workbench/`](../aftercare-workbench) — working prototype implementing this PRD · [`Design/`](../Design) — UML + SVG diagrams of the flow (activity, sequence, class, state, and component diagrams)

---

## 1. Problem statement

MOS Mechanical's aftercare process has a data problem, not just a process problem.
The facts needed to triage a fault call correctly — who installed the system, when it
was commissioned, what warranty terms apply, whether a service contract is active —
live in spreadsheets that are disconnected from the ticketing system. Whoever answers
the phone has to either know this off the top of their head or go hunting for it while
the customer is on the line. In practice, neither happens consistently, so:

- **Triage decisions are inconsistent.** The same fault, on the same kind of system,
  gets assigned to different parties (MOS chargeable / MOS warranty / manufacturer /
  original installer) depending on who took the call and whether they checked the
  spreadsheet.
- **Technical detail gets lost on the phone.** Error codes, photos, and precise
  symptoms are hard to capture reliably in an unguided phone call, so technicians
  are dispatched without the information they need to bring the right part or
  correctly scope the job.
- **Party assignment errors cost money.** A warranty job billed as chargeable damages
  trust; a chargeable job logged as warranty is lost revenue. Both currently happen
  because the warranty/commissioning lookup is manual and easy to skip under call
  volume.
- **There is no visibility into fault patterns.** Because tickets aren't linked
  cleanly to house history, nobody notices that the same site has called in three
  times for the same fault — which is exactly the signal that should trigger a
  different response (root-cause visit, escalation, manufacturer defect claim)
  instead of another routine repair visit.

## 2. Goals

1. Every aftercare ticket is created with house-specific data (system, install date,
   commissioning date, warranty terms, service contract status) attached
   automatically — not looked up ad hoc.
2. Triage decisions (assigned party, priority, chargeable/warranty status) are made
   by a consistent, auditable rule set, not by whoever picks up the phone.
3. Tickets are not created missing the technical detail (error codes, photos) needed
   to act on them — the intake flow makes this the easy path, not an afterthought.
4. Safety-critical reports (gas smell, carbon monoxide) are always handled by a
   human, on an emergency track, regardless of what any automation concludes.
5. Repeat faults at the same address become visible instead of being treated as N
   unrelated call-outs.
6. An AI-assisted voice/phone intake path exists that produces the same
   structured, triaged ticket a web form would — reviewed by a human before it is
   created, never auto-committed.

### Non-goals (for this phase)

- Replacing MOS's existing ticketing/CRM system outright — this is designed to sit in
  front of it and hand off a complete ticket (see §9, integration).
- Fully autonomous AI dispatch with no human in the loop. Every path in this design
  keeps a human able to see and correct the machine's decision before it is acted on.
- Real-time telephony/IVR integration (call routing, recording infrastructure) — the
  voice assistant here is scoped to intake and extraction, not full call handling.

## 3. Users

| Persona | Role | What they need from this |
|---|---|---|
| Office Admin (e.g. Niamh) | Answers phones / processes the web form | A single place that shows house history and produces a correctly-triaged ticket without manual spreadsheet lookups |
| Field Technician (e.g. Colm) | Attends the job | A ticket that already tells them what's covered, what parts/photos exist, and why |
| Operations Manager (e.g. Síle) | Owns aftercare P&L and SLAs | Consistent, auditable triage; visibility into repeat faults and chargeable revenue leakage; ability to override a rule with a recorded reason |
| Homeowner | Reports the fault | A faster, less repetitive intake (via phone or a simple web form) and correct expectations about cost set early |

## 4. Current vs. future process

**Today:** Customer calls → staff member manually asks questions, writes notes →
separately checks (or doesn't check) a spreadsheet for install/warranty info →
manually decides who owns the fault → creates a ticket in the ticketing system with
whatever detail was captured. Consistency and completeness depend entirely on the
individual handling the call.

**Future (this PRD):** Customer calls, uses the web form, or a voice intake is
transcribed → the system looks up the house record automatically → a guided
questionnaire (fault-type-specific) collects the details a technician actually needs
→ a deterministic rules engine decides party/priority/chargeable status from the
house record and the fault type → a complete, explained ticket is created, flagged
if anything required is still missing.

## 5. Solution overview

Three parts, all implemented in the prototype:

1. **A house/asset record** that holds what today lives in spreadsheets: system
   type, manufacturer, install date, commissioning date, warranty terms (parts vs.
   labour, which often differ), service contract status, and whether MOS or a third
   party installed it.
2. **A triage rules engine** — a pure function of (house record, fault report) →
   (assigned party, priority, chargeable flag, explanation). Same inputs always
   produce the same decision, and every decision names the rule that produced it, so
   it can be audited or corrected. See §7 for the full rule table.
3. **Two intake paths that feed the same engine:**
   - A **guided web form**: search the house → see its warranty/commissioning
     status up front → answer a fault-type-specific questionnaire that requires the
     evidence (error code, photo) the fault type needs.
   - A **voice/phone intake assistant**: a transcript (from speech-to-text or a
     typed call note) is run through an extractor that proposes a fault type, a
     matched house, and any error code mentioned — always shown to a human for
     confirmation before a ticket is created, never auto-submitted, and explicitly
     blocked from auto-processing anything that looks safety-critical.

## 6. Functional requirements

### 6.1 Guided web form
- FR-1: Search/select a house by address, customer name, or phone.
- FR-2: On selection, display system type, installer, commissioning date, warranty
  terms, and service-contract status without further lookup.
- FR-3: If commissioning date is missing, warn the user before they proceed — this
  ticket cannot get an automatic warranty decision.
- FR-4: Fault-type selection drives which fields are required (e.g. a heat pump
  fault code requires an error code and a photo; a noise complaint requires
  neither).
- FR-5: Two safety-screening checkboxes ("customer reports a gas smell", "CO alarm
  activated") are always present and, if checked, override every other rule.
- FR-6: Submitting runs the ticket through the triage engine server-side and shows
  the resulting party/priority/chargeable decision and its explanation immediately.

### 6.2 Triage rules engine
- FR-7: Triage is a deterministic function of the house record and the fault report;
  given the same inputs it always returns the same decision.
- FR-8: Every decision records which named rule produced it and a human-readable
  explanation (see §7).
- FR-9: Safety-critical fault types (gas, CO) always resolve to the emergency path,
  P1, and a mandatory human callback — no rule below them can be reached.
- FR-10: A missing commissioning date routes to manual back-office verification
  rather than guessing a warranty outcome.
- FR-11: A house with 2+ prior tickets for the same fault in the last 90 days is
  flagged as a repeat fault and its priority is raised one level.
- FR-12: A fault type that requires an error code or photo, if submitted without
  one, marks the ticket "incomplete" rather than silently accepting it.
- FR-13: A human with the right permission can override the assigned party, but only
  by supplying a reason, which is recorded on the ticket alongside the original
  rule's decision.

### 6.3 Voice/phone intake assistant
- FR-14: Given a transcript, the system proposes: a matched house (with confidence),
  a fault type (with confidence and the phrases that triggered it), and any error
  code mentioned.
- FR-15: If the safety-screening phrases (gas smell, CO alarm) are detected in the
  transcript, the draft is blocked from proceeding to ticket creation and instead
  instructs the handler to treat it as an emergency call.
- FR-16: Below a confidence threshold, or when no house can be confidently matched,
  the draft is flagged as requiring human review rather than being offered for
  one-click ticket creation.
- FR-17: Creating a ticket from a voice draft always passes through the same guided
  form (pre-filled) as a manually logged call — there is no separate, unreviewed
  ticket-creation path for voice.

### 6.4 Visibility
- FR-18: An operations view shows open tickets by assigned party, count of P1s,
  count of chargeable vs. warranty tickets, and count of repeat-fault flags.

## 7. Triage rules (as implemented)

Rules are evaluated in order; the first match decides the party/priority/chargeable
outcome. Repeat-fault detection and evidence-completeness checks apply afterwards,
independent of which rule matched.

| Rule | Condition | Party | Priority | Chargeable | AI mode |
|---|---|---|---|---|---|
| `RULE_01_SUSPECTED_GAS_LEAK` | Fault type is gas smell, or the gas-smell flag is set | Emergency protocol | P1 | No | **Prohibited** — human callback mandatory |
| `RULE_02_CO_ALARM` | Fault type is CO alarm, or the CO flag is set | Emergency protocol | P1 | No | **Prohibited** — human callback mandatory |
| `RULE_08_MISSING_COMMISSIONING_DATA` | House record has no commissioning date | Back-office review | Escalated one level | Unknown (TBD) | Human |
| `RULE_04_POST_INSTALL_SNAG_WINDOW` | MOS installed, ≤30 days since commissioning | MOS — labour warranty | P2 | No | Assist |
| `RULE_07_THIRD_PARTY_INSTALL` | Installed by someone other than MOS | Referred to original installer | Fault type's default | Unknown (offer chargeable MOS visit) | Human |
| `RULE_06_ACTIVE_SERVICE_CONTRACT` | Active service contract covers this fault type | MOS — under contract | Fault type's default | No | Assist |
| `RULE_03_IN_PARTS_WARRANTY_MANUFACTURER_DEFECT` | Fault type is a likely component defect and parts warranty is active | Manufacturer warranty claim | Fault type's default | No | Assist |
| `RULE_05_IN_LABOUR_WARRANTY` | Labour warranty is still active | MOS — labour warranty | Fault type's default | No | Assist |
| `RULE_09_OUT_OF_WARRANTY_CHARGEABLE` | None of the above apply | MOS — chargeable | Fault type's default | **Yes** | Assist |

**"AI mode" column** mirrors a pattern worth calling out explicitly: not every
triage decision is equally safe to let AI (voice assistant or otherwise) act on
without a human. `Prohibited` categories can never be auto-resolved. `Human`
categories always need a person to decide. `Assist` categories can have an AI-drafted
outcome, but a person confirms before it's final. There is no `deterministic`
category in triage itself (there is one in fault-type classification, e.g. routine
filter reminders) — warranty/chargeable calls always keep a human in the loop in this
phase, both because the model is new and because of the financial and safety stakes.

Fault types also carry required evidence (see `server/reference.js`): heat pump and
boiler fault codes require an error code and a photo; leaks require a photo; safety
categories require neither (don't make an emergency caller stop to take a photo).

## 8. Data model

**Site/house record** (today: scattered across spreadsheets):
`siteId, customerName, phone, email, address, eircode, systemType, manufacturer,
modelNumber, serialNumber, installedBy, installDate, commissioningDate,
warrantyPartsMonths, warrantyLabourMonths, serviceContract{active, plan, expiresAt},
seaiGrantScheme, lastServiceDate, vulnerableOccupant, notes`

**Ticket record** (created by intake, decided by triage):
`ticketId, siteId, channel, reportedBy, faultTypeId, errorCode, photos[], symptoms,
gasSmell, coAlarm, openedAt, state, priority, assignedParty, chargeable,
chargeReason, ruleId, explanation, requiresHumanCallback, dataQuality,
missingFields[], repeatFault, repeatFaultCount`

Full field definitions: [`server/data.js`](../aftercare-workbench/server/data.js) and
[`server/store.js`](../aftercare-workbench/server/store.js).

Two fields deserve a callout because they are the direct fix for stated pain points:
`warrantyLabourMonths` is tracked **separately** from `warrantyPartsMonths` because
manufacturers commonly warranty parts for longer than the installer warranties
labour — collapsing these into one "warranty" field is a common source of incorrect
chargeable decisions. And `commissioningDate` (not install date) is what warranty
clocks run from; a house with an install date but no commissioning date is a data
gap, not a customer able to be triaged normally (`RULE_08`).

## 9. AI voice assistant — how it works, and how it doesn't

The prototype's voice intake (`server/classifier.js`) is a deliberately simple,
regex/keyword-based extractor, versioned as
`voice-intake-stub-classifier-2026-09-01`. It is not connected to a real speech
model or LLM. It exists to:

1. Prove out the **interface** a real implementation would need to satisfy:
   `transcript → { faultType: {value, score, evidence}, errorCode, site: {siteId,
   score, evidence}, safetyFlags, requiresHumanReview }`.
2. Demonstrate the **safety gating** that has to exist regardless of how good the
   underlying model is: a detected safety flag always blocks automated processing,
   and low confidence always forces human review — these are policy decisions, not
   model behaviour, and should not disappear when the model improves.
3. Let the guided-form and triage-engine work be evaluated independently of
   committing to a specific ASR/LLM vendor.

**Production path:** replace `classifyIntake()` with a call to a real speech-to-text
service (for live calls) and an LLM prompt constrained to the same output schema,
behind the same function signature. Because the rest of the system (triage engine,
UI, ticket schema) only depends on that schema, this swap should not require changing
anything else. Recommended guardrails to carry forward unchanged:
- A **kill switch** to disable AI-drafted extraction instantly and fall back to fully
  manual intake, without a deploy.
- **No autonomous ticket creation** — every AI-drafted ticket is confirmed through
  the same guided form a human-logged call goes through.
- **Confidence thresholds and safety-flag detection stay server-side policy**, not
  something the model itself is trusted to enforce.

## 10. Why this stack

The prototype (`aftercare-workbench/`) is plain Node on the server and dependency-free
vanilla JavaScript on the client — no framework, no build step, no npm install
required to run it. This is a deliberate fit for MOS Mechanical's situation, not a
default: MOS has no in-house software team, and a system like this will likely be
run and lightly maintained by a generalist IT contact or a managed service provider.
`git clone` + `node server/index.js` being the entire deployment, and every file
being plainly readable without React/JSX/bundler knowledge, is worth more here than
the productivity a framework would offer a dedicated engineering team. If MOS later
staffs an in-house dev team or the UI's complexity grows substantially, revisit this
trade-off — it is not a claim that this stack is right forever, only that it is right
for this phase.

The same reasoning drives two other choices worth naming: ticket data persists to a
plain JSON file rather than a database (inspectable, no ops burden, fine at MOS's
call volume — revisit if volume or concurrent-write needs grow), and the UI renders
all customer-supplied text as DOM text nodes rather than HTML, which closes off
stored-XSS from a crafted fault description or transcript without needing a
sanitization library.

## 11. Success metrics

| Metric | Why it matters |
|---|---|
| % of tickets created with a named triage rule (vs. "missing data" routes) | Directly measures whether the warranty/commissioning data gap is closing |
| % of tickets marked `dataQuality: incomplete` at creation | Measures whether guided intake is actually collecting error codes/photos |
| Chargeable-ticket dispute/reversal rate | Proxy for triage correctness — a wrong chargeable call usually surfaces as a customer dispute |
| Wasted site visits (technician attends, cannot act — wrong party, missing part) | The core cost this project targets |
| Repeat-fault tickets caught by `RULE_10` before a 3rd visit | Measures the new fault-pattern visibility this system adds |
| Time from call start to ticket created | Should drop for web-form/voice intake vs. manual logging |
| % of voice-intake drafts confirmed without edits | Health signal for the extractor once a real model replaces the stub — not a target to optimize prematurely |

## 12. Phased rollout

- **Phase 0 (this deliverable):** Working prototype — guided form, triage engine,
  voice-intake demo, seed data standing in for the real house register.
- **Phase 1:** Migrate the real house/warranty spreadsheet into the site record
  schema; pilot the guided web form with office admins on live calls, engine
  decisions reviewed but not yet fully trusted.
- **Phase 2:** Wire ticket creation into MOS's actual ticketing system (webhook or
  API push once a complete ticket is produced) instead of the prototype's standalone
  store; retire duplicate manual entry.
- **Phase 3:** Replace the stub classifier with a real speech-to-text + LLM
  extraction pipeline behind the same interface; pilot on a subset of inbound calls
  with the kill switch on hand.
- **Phase 4:** Expand fault-type and rule coverage based on Phase 1–2 data (e.g.
  manufacturer-specific warranty nuances, additional SEAI/grant-scheme conditions).

## 13. Risks

| Risk | Mitigation |
|---|---|
| Real warranty terms are more varied than the prototype's per-fault-type model (manufacturer-specific exceptions, grant-scheme conditions) | Treat §7's rule table as a first draft; validate against actual manufacturer warranty documents before Phase 1 go-live |
| Office admins distrust or route around the tool under call pressure | Keep the override path fast (§6.2 FR-13) so correcting a wrong decision is easier than working around the tool entirely |
| Voice extraction (once real) misclassifies safety-critical language | Safety-flag detection is intentionally broad/keyword-based rather than confidence-scored, and sits outside the model's own judgment — see §9 |
| House register migration from spreadsheets introduces the same gaps it's meant to fix (e.g. missing commissioning dates) | `RULE_08` makes a missing date visible and unactionable-by-default rather than silently defaulting to a guess, which also surfaces migration data quality issues immediately |
| Call/voice recordings and transcripts contain personal data | Data retention and consent for recording are legal/compliance questions this PRD flags but does not resolve — see open questions |

## 14. Open questions for MOS stakeholders

1. What ticketing system is in use today, and does it have an API/webhook for
   Phase 2 integration, or would this need to be a manual export/import initially?
2. Do warranty terms vary meaningfully by manufacturer beyond parts/labour month
   counts (e.g. different conditions for heat pumps under SEAI grant schemes)?
3. Who is the actual emergency/on-call contact for `RULE_01`/`RULE_02`, and is there
   an existing gas-emergency protocol this should defer to rather than duplicate?
4. Is there an existing service-contract product catalog, or does "Annual Care Plan"
   in the prototype need to be replaced with real plan names/terms?
5. What is the data source and format for the real house/warranty register, and who
   owns keeping commissioning dates logged going forward (so `RULE_08` becomes rare
   rather than common)?
6. For voice intake: is call recording/transcription already legally covered under
   existing customer consent, or does this require its own consent flow?
