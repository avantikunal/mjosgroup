/**
 * In-memory store with write-through persistence to a JSON file. No database
 * dependency: `node server/index.js` is the whole deployment, and data/tickets.json
 * can be opened and read by a non-technical office admin if they ever need to.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { SITES, TICKETS } = require('./data');
const { triage } = require('./triage');

const DATA_FILE = path.join(__dirname, '..', 'data', 'tickets.json');

let sites = SITES.map((s) => ({ ...s }));
let tickets = [];

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    tickets = JSON.parse(raw);
  } catch (err) {
    tickets = TICKETS.map((t) => enrichTicket(t));
    persist();
  }
}

function persist() {
  // Best-effort: on a read-only filesystem (e.g. a serverless deployment) this
  // fails silently and the store falls back to in-memory-only for that instance,
  // rather than crashing the request. See docs/PRD.md "Why this stack" and
  // README.md "Deploying to Vercel" for the trade-off this implies there.
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2), 'utf8');
  } catch (err) {
    // no-op
  }
}

function enrichTicket(base) {
  const site = sites.find((s) => s.siteId === base.siteId);
  const history = tickets.filter((t) => t.siteId === base.siteId && t.ticketId !== base.ticketId);
  const decision = triage(site, base, history);
  return {
    ...base,
    priority: decision.priority,
    assignedParty: decision.party,
    chargeable: decision.chargeable,
    chargeReason: decision.chargeReason,
    aiMode: decision.aiMode,
    ruleId: decision.ruleId,
    explanation: decision.explanation,
    requiresHumanCallback: decision.requiresHumanCallback,
    dataQuality: decision.dataQuality,
    missingFields: decision.missingFields,
    repeatFault: decision.repeatFault,
    repeatFaultCount: decision.repeatFaultCount || 0,
  };
}

function listSites(query) {
  if (!query) return sites;
  const q = query.toLowerCase();
  return sites.filter(
    (s) =>
      s.address.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
  );
}

function getSite(siteId) {
  return sites.find((s) => s.siteId === siteId) || null;
}

function listTickets(filters = {}) {
  return tickets
    .filter((t) => !filters.party || t.assignedParty === filters.party)
    .filter((t) => !filters.priority || t.priority === filters.priority)
    .filter((t) => !filters.state || t.state === filters.state)
    .slice()
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
}

function getTicket(ticketId) {
  return tickets.find((t) => t.ticketId === ticketId) || null;
}

function createTicket(input) {
  const site = getSite(input.siteId);
  if (!site) {
    const err = new Error('Unknown siteId');
    err.status = 400;
    throw err;
  }
  const base = {
    ticketId: 'ticket-' + crypto.randomBytes(4).toString('hex'),
    siteId: input.siteId,
    channel: input.channel || 'web-form',
    reportedBy: input.reportedBy || site.customerName,
    faultTypeId: input.faultTypeId,
    errorCode: input.errorCode || '',
    photos: input.photos || [],
    symptoms: input.symptoms || '',
    gasSmell: !!input.gasSmell,
    coAlarm: !!input.coAlarm,
    openedAt: new Date().toISOString(),
    state: 'New',
  };
  const ticket = enrichTicket(base);
  tickets.push(ticket);
  persist();
  return ticket;
}

function updateTicket(ticketId, patch) {
  const idx = tickets.findIndex((t) => t.ticketId === ticketId);
  if (idx === -1) return null;
  const current = tickets[idx];

  // Manual overrides of the triage decision are allowed, but only with a reason —
  // mirrors the "change request type / save correction" pattern: a human can correct
  // the system, but the correction and its justification are recorded, not silent.
  const next = { ...current, ...patch };
  if (patch.assignedParty && patch.assignedParty !== current.assignedParty && !patch.overrideReason) {
    const err = new Error('overrideReason is required when changing assignedParty');
    err.status = 400;
    throw err;
  }
  if (patch.assignedParty && patch.assignedParty !== current.assignedParty) {
    next.ruleId = 'MANUAL_OVERRIDE';
    next.explanation = `Manually reassigned from ${current.assignedParty} to ${patch.assignedParty}. Reason: ${patch.overrideReason}`;
  }

  tickets[idx] = next;
  persist();
  return tickets[idx];
}

function resetToSeed() {
  tickets = TICKETS.map((t) => enrichTicket(t));
  persist();
  return tickets;
}

load();

module.exports = { listSites, getSite, listTickets, getTicket, createTicket, updateTicket, resetToSeed };
