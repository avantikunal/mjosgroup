/**
 * Reference data for the aftercare workbench — the fault types, priorities, parties
 * and states, kept as one config so a policy change (a new SLA target, a new fault
 * category) is a single edit rather than a hunt through the codebase.
 *
 * The five fault categories and the parties below are taken directly from MOS
 * Mechanical's own documents (not invented for this prototype):
 *   - "Aftercare Call Triage Guide"
 *   - "Aftercare Call Guide — within 1 year warranty"
 *   - "Aftercare Call Guide — over 1 year warranty"
 *   - "Heat Pump Decision Tree"
 * See docs/PRD.md §7 for the rule-by-rule mapping back to these documents.
 */

const FAULT_TYPES = {
  'LEAK-INGRESS': {
    label: 'Leak / Water Ingress',
    examples: 'Radiator leak, pipe leak, cylinder leak, overflow, damp / water stains',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'assist',
    requiresPhoto: true, // "Request Photos / Videos"
    requiresErrorCode: false,
    requiresSerialNumber: false,
  },
  'NO-HEATING': {
    label: 'No Heating',
    examples: 'No heating upstairs/downstairs, radiators cold, underfloor heating issue, heating not coming on',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'assist',
    requiresPhoto: true, // "Request Error Codes & Photos of Controller"
    requiresErrorCode: false,
    requiresSerialNumber: false,
  },
  'NO-HOT-WATER': {
    label: 'No Hot Water',
    examples: 'No hot water, water not hot enough, hot water running out quickly',
    department: 'field-service',
    priority: 'P3',
    aiMode: 'assist',
    requiresPhoto: true,
    requiresErrorCode: false,
    requiresSerialNumber: false,
  },
  'HEAT-PUMP-FAULT': {
    label: 'Heat Pump Error / Fault',
    examples: 'Error code showing, heat pump not heating, noise / leaking, outdoor unit issue',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'human', // a senior plumber always decides — see triage.js
    requiresPhoto: true, // "photo of display"
    requiresErrorCode: true,
    requiresSerialNumber: true,
  },
  'OTHER-QUERY': {
    label: 'Other Query / Advice',
    examples: 'How to use system, settings questions, general queries, high running costs',
    department: 'guidance',
    priority: 'P4',
    aiMode: 'deterministic-candidate',
    requiresPhoto: false,
    requiresErrorCode: false,
    requiresSerialNumber: false,
  },
};

// The exact checklist from the Aftercare Call Triage Guide's "Is it a plumbing
// leak?" box. A YES on any of these means Builder/Snagging, not MOS — regardless
// of warranty status ("Not our plumbing responsibility").
const LEAK_SNAGGING_CHECKLIST = {
  roofLeak: 'Roof leak',
  showerTraySealFailure: 'Shower tray not sealed',
  externalDrainBlocked: 'External drain / waste pipe blocked',
  waterIngressBuildingFabric: 'Water ingress from building fabric',
  skylightWindowLeak: 'Skylight / window leak',
};

const PRIORITIES = {
  P1: { rank: 1, label: 'P1 — Emergency', firstResponseMinutes: 60, resolutionMinutes: 240, clock: '24x7' },
  P2: { rank: 2, label: 'P2 — Urgent', firstResponseMinutes: 240, resolutionMinutes: 1440, clock: 'extended' },
  P3: { rank: 3, label: 'P3 — Standard', firstResponseMinutes: 1440, resolutionMinutes: 4320, clock: 'business' },
  P4: { rank: 4, label: 'P4 — Routine', firstResponseMinutes: 4320, resolutionMinutes: 10080, clock: 'business' },
};

// "Parties" = who the ticket is accountable to — the pitch deck's "five different
// people" a call can end up with. Chargeable outcomes carry a separate chargeParty
// (builder vs. homeowner) rather than being modelled as extra parties, since MOS
// still attends in both cases — only who gets billed differs.
const PARTIES = {
  'plumbing-team': {
    label: 'MOS Plumbing Team',
    accountableRole: 'field-service',
    restricted: false,
  },
  'builder-snagging': {
    label: 'Builder / Snagging Team',
    accountableRole: 'builder',
    restricted: false,
  },
  'plumber-review-chargeable': {
    label: 'Plumber to Review — Chargeable',
    accountableRole: 'field-service',
    restricted: false,
  },
  'heat-merchants-warranty': {
    label: 'Heat Merchants — Supplier Warranty Claim',
    accountableRole: 'field-service',
    restricted: false,
  },
  'customer-guidance': {
    label: 'Customer Guidance / Advice',
    accountableRole: 'office-admin',
    restricted: false,
  },
  'triage-review': {
    label: 'Office — Warranty Verification Needed',
    accountableRole: 'office-admin',
    restricted: false,
  },
};

const STATES = [
  'New',
  'Triage',
  'Awaiting Info',
  'Scheduled',
  'En Route',
  'On Site',
  'Awaiting Parts',
  'Resolved',
  'Invoice Pending',
  'Closed',
  'Reopened',
];

const THRESHOLDS = {
  siteMatchConfidence: 0.9,
  faultTypeAutoSuggestConfidence: 0.75,
};

const POLICY_VERSIONS = {
  triage: 'triage-v2-mos-documented-rules',
  sla: 'sla-v1',
  classifier: 'voice-intake-stub-classifier-2026-09-01',
};

const REFERENCE = {
  faultTypes: FAULT_TYPES,
  leakSnaggingChecklist: LEAK_SNAGGING_CHECKLIST,
  priorities: PRIORITIES,
  parties: PARTIES,
  states: STATES,
  thresholds: THRESHOLDS,
  policyVersions: POLICY_VERSIONS,
};

module.exports = { REFERENCE };
