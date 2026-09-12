/**
 * Triage rules engine.
 *
 * This function is the whole point of the project: today the same phone call could be
 * assigned differently depending on who answers it, because warranty/commissioning
 * data lives in a spreadsheet nobody checks mid-call. Here the decision is a pure
 * function of (site record, fault report) — same inputs always produce the same
 * assigned party, priority and chargeable flag, and every decision names the rule
 * that fired so it can be audited or corrected.
 *
 * Rules are evaluated in order; the first match wins. Safety rules are always first
 * and cannot be short-circuited by warranty or contract status.
 */

const { REFERENCE } = require('./reference');

const POST_INSTALL_SNAG_DAYS = 30;
const REPEAT_FAULT_WINDOW_DAYS = 90;

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function addMonthsToDate(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

function decision(ruleId, fields) {
  return { ruleId, dataQuality: 'complete', missingFields: [], repeatFault: false, ...fields };
}

/**
 * @param {object} site - a record from server/data.js SITES
 * @param {object} report - { faultTypeId, errorCode, photos, gasSmell, coAlarm, reportedAt }
 * @param {object[]} priorHistory - other tickets for the same site, most recent first
 */
function triage(site, report, priorHistory = []) {
  const faultType = REFERENCE.faultTypes[report.faultTypeId] || REFERENCE.faultTypes.OTHER;
  const reportedAt = report.reportedAt || new Date().toISOString();

  let result;

  // RULE_01 / RULE_02 — safety-critical. Always wins, regardless of warranty, contract,
  // or who installed the system. AI may never auto-assign or auto-close these; a human
  // must call the customer back. This mirrors the "prohibited" AI mode used for
  // complaints/safety cases in comparable triage systems.
  if (report.faultTypeId === 'SAFETY-GAS' || report.gasSmell) {
    result = decision('RULE_01_SUSPECTED_GAS_LEAK', {
      party: 'emergency-gas',
      priority: 'P1',
      aiMode: 'prohibited',
      chargeable: false,
      chargeReason: null,
      requiresHumanCallback: true,
      explanation:
        'Suspected gas smell/leak reported. Routed to the emergency protocol regardless of warranty status. ' +
        'This category can never be auto-assigned or auto-closed — a human must call the customer back immediately ' +
        'and advise standard gas-safety guidance.',
    });
  } else if (report.faultTypeId === 'SAFETY-CO' || report.coAlarm) {
    result = decision('RULE_02_CO_ALARM', {
      party: 'emergency-gas',
      priority: 'P1',
      aiMode: 'prohibited',
      chargeable: false,
      chargeReason: null,
      requiresHumanCallback: true,
      explanation:
        'Carbon monoxide alarm reported. Routed to the emergency protocol regardless of warranty status. ' +
        'This category can never be auto-assigned or auto-closed — a human must call the customer back immediately.',
    });
  } else if (!site.commissioningDate) {
    // RULE_08 — the exact data gap this project targets: without a commissioning date,
    // warranty status is undecidable. Rather than guess (and risk billing a customer who
    // is actually in warranty, or vice versa), the ticket is routed for manual lookup.
    result = decision('RULE_08_MISSING_COMMISSIONING_DATA', {
      party: 'triage-review',
      priority: faultType.priority === 'P1' ? 'P1' : upgradePriority(faultType.priority),
      aiMode: 'human',
      chargeable: null,
      chargeReason: null,
      requiresHumanCallback: false,
      explanation:
        'Commissioning date is missing from the site record, so warranty status cannot be determined automatically. ' +
        'Routed to back-office for manual verification before a party or charge decision is made — this prevents an ' +
        'incorrect chargeable/warranty call caused by an incomplete record.',
    });
  } else {
    const daysSinceCommission = daysBetween(site.commissioningDate, reportedAt);

    if (site.installedBy === 'MOS Mechanical' && daysSinceCommission <= POST_INSTALL_SNAG_DAYS) {
      // RULE_04
      result = decision('RULE_04_POST_INSTALL_SNAG_WINDOW', {
        party: 'mos-warranty-labour',
        priority: 'P2',
        aiMode: 'assist',
        chargeable: false,
        chargeReason: null,
        requiresHumanCallback: false,
        explanation: `Reported ${daysSinceCommission} day(s) after MOS Mechanical commissioned the system — within the ${POST_INSTALL_SNAG_DAYS}-day post-install snag window. Treated as an install defect, not chargeable.`,
      });
    } else if (site.installedBy !== 'MOS Mechanical') {
      // RULE_07
      result = decision('RULE_07_THIRD_PARTY_INSTALL', {
        party: 'third-party-installer',
        priority: faultType.priority,
        aiMode: 'human',
        chargeable: null,
        chargeReason: null,
        requiresHumanCallback: false,
        explanation: `System was installed by ${site.installedBy}, not MOS Mechanical, so MOS has no warranty obligation. Referred back to the original installer; a chargeable MOS visit can be offered if the customer prefers.`,
      });
    } else if (site.serviceContract && site.serviceContract.active && faultType.coveredByServiceContract !== false) {
      // RULE_06
      result = decision('RULE_06_ACTIVE_SERVICE_CONTRACT', {
        party: 'mos-service-contract',
        priority: faultType.priority,
        aiMode: 'assist',
        chargeable: false,
        chargeReason: null,
        requiresHumanCallback: false,
        explanation: `Site has an active ${site.serviceContract.plan} (expires ${site.serviceContract.expiresAt}) — call-out and labour are covered under contract terms.`,
      });
    } else {
      const partsWarrantyEnd = addMonthsToDate(site.commissioningDate, site.warrantyPartsMonths);
      const labourWarrantyEnd = addMonthsToDate(site.commissioningDate, site.warrantyLabourMonths);
      const now = new Date(reportedAt);
      const inPartsWarranty = now <= partsWarrantyEnd;
      const inLabourWarranty = now <= labourWarrantyEnd;

      if (faultType.likelyManufacturerDefect && inPartsWarranty) {
        // RULE_03
        result = decision('RULE_03_IN_PARTS_WARRANTY_MANUFACTURER_DEFECT', {
          party: 'manufacturer-warranty',
          priority: faultType.priority,
          aiMode: 'assist',
          chargeable: false,
          chargeReason: null,
          requiresHumanCallback: false,
          explanation: `Fault type is typically a component/manufacturer defect and the parts warranty (expires ${partsWarrantyEnd.toISOString().slice(0, 10)}) is still active. Routed as a manufacturer warranty claim — MOS Mechanical arranges the visit and recharges the manufacturer.`,
        });
      } else if (inLabourWarranty) {
        // RULE_05
        result = decision('RULE_05_IN_LABOUR_WARRANTY', {
          party: 'mos-warranty-labour',
          priority: faultType.priority,
          aiMode: 'assist',
          chargeable: false,
          chargeReason: null,
          requiresHumanCallback: false,
          explanation: `Labour warranty (expires ${labourWarrantyEnd.toISOString().slice(0, 10)}) is still active — MOS Mechanical attends at no charge.`,
        });
      } else {
        // RULE_09 — the default once every warranty/contract path is exhausted.
        result = decision('RULE_09_OUT_OF_WARRANTY_CHARGEABLE', {
          party: 'mos-chargeable',
          priority: faultType.priority,
          aiMode: 'assist',
          chargeable: true,
          chargeReason: `Labour warranty expired ${labourWarrantyEnd.toISOString().slice(0, 10)} and no active service contract.`,
          requiresHumanCallback: false,
          explanation: `System is out of warranty with no active service contract — this is a chargeable repair visit. The customer should be told the call-out charge before a visit is scheduled.`,
        });
      }
    }
  }

  // RULE_10 — repeat-fault detection, independent of the party/priority decision above.
  // This is what gives the business "fault pattern visibility": three call-outs for the
  // same fault on the same house in 90 days is very different from three unrelated ones.
  const recentSameSite = priorHistory.filter(
    (t) => t.siteId === site.siteId && daysBetween(t.openedAt, reportedAt) <= REPEAT_FAULT_WINDOW_DAYS
  );
  if (recentSameSite.length >= 2) {
    result.repeatFault = true;
    result.repeatFaultCount = recentSameSite.length;
    result.priority = upgradePriority(result.priority);
    result.explanation += ` Flagged as a repeat fault: ${recentSameSite.length} prior ticket(s) for this site in the last ${REPEAT_FAULT_WINDOW_DAYS} days — priority raised one level and flagged for pattern review.`;
  }

  // Evidence gating — the other half of the stated problem: calls that skip error codes
  // or photos. The ticket is still created (so nothing gets lost), but is marked
  // incomplete until the missing evidence is attached.
  const missingFields = [];
  if (faultType.requiresErrorCode && !report.errorCode) missingFields.push('errorCode');
  if (faultType.requiresPhoto && (!report.photos || report.photos.length === 0)) missingFields.push('photo');
  if (missingFields.length > 0) {
    result.dataQuality = 'incomplete';
    result.missingFields = missingFields;
  }

  return result;
}

function upgradePriority(priorityId) {
  const order = ['P1', 'P2', 'P3', 'P4'];
  const idx = order.indexOf(priorityId);
  return idx <= 0 ? 'P1' : order[idx - 1];
}

module.exports = { triage, daysBetween };
