/**
 * Reference data for the aftercare workbench.
 *
 * This is the single place that defines what a fault type, priority, party or state
 * *means*. The triage engine (triage.js) and the UI both read from here rather than
 * hard-coding labels or SLA minutes in more than one place. When MOS changes a policy
 * (e.g. a new SLA target, a new fault category) this file is the only edit required.
 */

const FAULT_TYPES = {
  'SAFETY-GAS': {
    label: 'Suspected gas smell / leak',
    department: 'emergency',
    priority: 'P1',
    aiMode: 'prohibited',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
    coveredByServiceContract: false,
  },
  'SAFETY-CO': {
    label: 'Carbon monoxide alarm activated',
    department: 'emergency',
    priority: 'P1',
    aiMode: 'prohibited',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
    coveredByServiceContract: false,
  },
  'HEAT-NONE': {
    label: 'No heating / no hot water',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'assist',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
  },
  'HP-FAULT': {
    label: 'Heat pump fault code / trip',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'assist',
    requiresErrorCode: true,
    requiresPhoto: true,
    likelyManufacturerDefect: true,
  },
  'BOILER-FAULT': {
    label: 'Boiler fault code / lockout',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'assist',
    requiresErrorCode: true,
    requiresPhoto: true,
    likelyManufacturerDefect: true,
  },
  'LEAK': {
    label: 'Water leak / drip from system',
    department: 'field-service',
    priority: 'P2',
    aiMode: 'assist',
    requiresErrorCode: false,
    requiresPhoto: true,
    likelyManufacturerDefect: false,
  },
  'HEAT-INTERMIT': {
    label: 'Intermittent heating fault',
    department: 'field-service',
    priority: 'P3',
    aiMode: 'assist',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
  },
  'CONTROLS': {
    label: 'Thermostat / app / controls issue',
    department: 'field-service',
    priority: 'P3',
    aiMode: 'assist',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: true,
  },
  'NOISE': {
    label: 'Unusual noise from system',
    department: 'field-service',
    priority: 'P4',
    aiMode: 'assist',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
  },
  'MVHR-FILTER': {
    label: 'MVHR filter / ventilation fault',
    department: 'field-service',
    priority: 'P4',
    aiMode: 'deterministic-candidate',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
  },
  'ANNUAL-SERVICE': {
    label: 'Routine annual service / maintenance',
    department: 'scheduling',
    priority: 'P4',
    aiMode: 'deterministic-candidate',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
    coveredByServiceContract: true,
  },
  'OTHER': {
    label: 'Other / not sure',
    department: 'field-service',
    priority: 'P3',
    aiMode: 'human',
    requiresErrorCode: false,
    requiresPhoto: false,
    likelyManufacturerDefect: false,
  },
};

const PRIORITIES = {
  P1: { rank: 1, label: 'P1 — Emergency', firstResponseMinutes: 60, resolutionMinutes: 240, clock: '24x7' },
  P2: { rank: 2, label: 'P2 — Urgent', firstResponseMinutes: 240, resolutionMinutes: 1440, clock: 'extended' },
  P3: { rank: 3, label: 'P3 — Standard', firstResponseMinutes: 1440, resolutionMinutes: 4320, clock: 'business' },
  P4: { rank: 4, label: 'P4 — Routine', firstResponseMinutes: 4320, resolutionMinutes: 10080, clock: 'business' },
};

// "Parties" = who the ticket is accountable to. This is the answer to "who should be
// on-site or who should be paying" — the exact decision that was previously made
// inconsistently by whoever answered the phone.
const PARTIES = {
  'emergency-gas': {
    label: 'Emergency protocol (gas/CO)',
    accountableRole: 'on-call-engineer',
    restricted: true,
    chargeableDefault: false,
  },
  'mos-warranty-labour': {
    label: 'MOS Mechanical — labour warranty (no charge)',
    accountableRole: 'field-service',
    restricted: false,
    chargeableDefault: false,
  },
  'mos-service-contract': {
    label: 'MOS Mechanical — covered by service contract',
    accountableRole: 'field-service',
    restricted: false,
    chargeableDefault: false,
  },
  'mos-chargeable': {
    label: 'MOS Mechanical — chargeable repair',
    accountableRole: 'field-service',
    restricted: false,
    chargeableDefault: true,
  },
  'manufacturer-warranty': {
    label: 'Manufacturer warranty claim',
    accountableRole: 'field-service',
    restricted: false,
    chargeableDefault: false,
  },
  'third-party-installer': {
    label: 'Referred to original (non-MOS) installer',
    accountableRole: 'back-office',
    restricted: false,
    chargeableDefault: null,
  },
  'triage-review': {
    label: 'Back-office — data verification needed',
    accountableRole: 'back-office',
    restricted: false,
    chargeableDefault: null,
  },
  'mos-scheduling': {
    label: 'MOS Mechanical — scheduled maintenance',
    accountableRole: 'scheduling',
    restricted: false,
    chargeableDefault: false,
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
  triage: 'triage-v1',
  sla: 'sla-v1',
  classifier: 'voice-intake-stub-classifier-2026-09-01',
};

const REFERENCE = {
  faultTypes: FAULT_TYPES,
  priorities: PRIORITIES,
  parties: PARTIES,
  states: STATES,
  thresholds: THRESHOLDS,
  policyVersions: POLICY_VERSIONS,
};

module.exports = { REFERENCE };
