/**
 * Triage rules engine — implements MOS Mechanical's own documented process, not an
 * invented one. Every rule below cites the MOS document it comes from so the mapping
 * can be checked directly against the source guides (also see docs/PRD.md §7):
 *   - "Aftercare Call Triage Guide"
 *   - "Aftercare Call Guide — within 1 year warranty"
 *   - "Aftercare Call Guide — over 1 year warranty"
 *   - "Heat Pump Decision Tree"
 *
 * Same inputs always produce the same decision, and every decision names the rule
 * that produced it, so a triage outcome can be audited or corrected rather than
 * trusted blindly — this is the direct fix for "It runs on who is on the phone"
 * (Problem #4 in MOS's own problem summary).
 */

const { REFERENCE } = require('./reference');

const MOS_WARRANTY_MONTHS_DEFAULT = 12; // "Every install carries a one year plumbing warranty" (Pitch, p.2)
const ANNUAL_SERVICE_MONTHS = 12;

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function addMonthsToDate(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

function decision(ruleId, fields) {
  return { ruleId, dataQuality: 'complete', missingFields: [], repeatFault: false, chargeParty: null, requiresSeniorPlumberSignOff: false, ...fields };
}

function upgradePriority(priorityId) {
  const order = ['P1', 'P2', 'P3', 'P4'];
  const idx = order.indexOf(priorityId);
  return idx <= 0 ? 'P1' : order[idx - 1];
}

/**
 * @param {object} site - a record from server/data.js SITES
 * @param {object} report - { faultTypeId, errorCode, serialNumber, photos, symptoms,
 *   leakChecklist: {roofLeak, showerTraySealFailure, externalDrainBlocked,
 *   waterIngressBuildingFabric, skylightWindowLeak}, serviceCertsProvided, reportedAt }
 * @param {object[]} priorHistory - other tickets for the same site
 */
function triage(site, report, priorHistory = []) {
  const faultType = REFERENCE.faultTypes[report.faultTypeId] || REFERENCE.faultTypes['OTHER-QUERY'];
  const reportedAt = report.reportedAt || new Date().toISOString();
  const now = new Date(reportedAt);

  let result;

  // OTHER-QUERY / ADVICE — resolved on the call, no warranty check needed at all.
  // "Provide Guidance / Advice ... Resolve if possible" (Triage Guide) applies the
  // same way whatever the commissioning date says.
  if (report.faultTypeId === 'OTHER-QUERY') {
    result = decision('RULE_GUIDANCE_ONLY', {
      party: 'customer-guidance',
      priority: 'P4',
      chargeable: false,
      aiMode: 'deterministic-candidate',
      explanation:
        'Guidance / advice query — resolved on the call with videos or user guides where possible. No visit, and no warranty check needed (Aftercare Call Triage Guide).',
    });
  } else if (!site.commissioningDate) {
    // Missing commissioning date — the exact data gap MOS's own problem summary
    // names first: "Commissioning date ... sits in certificates and spreadsheets."
    // "Always check warranty date before sending anyone" (Triage Guide, Important
    // Reminders) — so an unverifiable date is routed for manual lookup rather than
    // guessed.
    result = decision('RULE_MISSING_COMMISSIONING_DATE', {
      party: 'triage-review',
      priority: upgradePriority(faultType.priority),
      chargeable: null,
      aiMode: 'human',
      explanation:
        'Commissioning date is not on file, so warranty status cannot be confirmed. "Always check warranty date before sending anyone" (Aftercare Call Triage Guide) — routed to the office for manual verification before a party or charge decision is made.',
    });
  } else if (report.faultTypeId === 'LEAK-INGRESS' && leakMatchesSnaggingChecklist(report)) {
    // Builder/Snagging checklist — checked before any warranty logic, and its
    // outcome doesn't depend on warranty status: a roof leak is the builder's job
    // whether the house is one month or five years past commissioning.
    const hits = Object.entries(REFERENCE.leakSnaggingChecklist)
      .filter(([key]) => report.leakChecklist && report.leakChecklist[key])
      .map(([, label]) => label);
    result = decision('RULE_BUILDER_SNAGGING', {
      party: 'builder-snagging',
      priority: faultType.priority,
      chargeable: null,
      chargeParty: 'builder',
      aiMode: 'assist',
      explanation: `Matches a builder/snagging item (${hits.join(', ')}) — "Not our plumbing responsibility" (Aftercare Call Triage Guide). Builder/Snagging Team attends first, regardless of warranty status.`,
    });
  } else if (report.faultTypeId === 'HEAT-PUMP-FAULT' && isRefrigerantCode(report.errorCode)) {
    // Heat Pump Decision Tree, Error Code Guide: "Panasonic Error beginning with
    // F- or F Gas = WARRANTY CALL REQUIRED". A refrigerant-circuit fault is always
    // a supplier (Heat Merchants) matter, not MOS's own plumbing warranty — but
    // "Warranty cover ... only stands up if the annual service has been done and
    // certified" (Pitch, p.2), and those certificates are chased from the
    // homeowner at the time of the call, not known in advance.
    if (!report.serviceCertsProvided) {
      result = decision('RULE_HEATPUMP_SERVICE_CERTS_REQUIRED', {
        party: 'heat-merchants-warranty',
        priority: faultType.priority,
        chargeable: null,
        aiMode: 'human',
        dataQuality: 'incomplete',
        missingFields: ['serviceCerts'],
        requiresSeniorPlumberSignOff: true,
        explanation: `Error code ${report.errorCode} indicates a refrigerant-circuit fault ("F-/F Gas = Warranty Call Required", Heat Pump Decision Tree). Supplier warranty cover depends on the annual service certificate, which has not been supplied yet — request all service certificates from the homeowner before this can be logged with Heat Merchants. A senior plumber must confirm.`,
      });
    } else {
      result = decision('RULE_HEATPUMP_SUPPLIER_WARRANTY', {
        party: 'heat-merchants-warranty',
        priority: faultType.priority,
        chargeable: false,
        aiMode: 'human',
        requiresSeniorPlumberSignOff: true,
        explanation: `Error code ${report.errorCode} indicates a refrigerant-circuit fault ("F-/F Gas = Warranty Call Required", Heat Pump Decision Tree). Service certificates are attached — log a warranty call with Heat Merchants once a senior plumber confirms.`,
      });
    }
  } else {
    // Everything else (No Heating, No Hot Water, a non-snagging Leak, or a Heat
    // Pump fault that is hydraulic / has no clear error code) follows MOS's own
    // 1-year plumbing warranty, then the builder's own (often longer) warranty,
    // then falls to a chargeable visit.
    const mosWarrantyMonths = site.mosWarrantyMonths ?? MOS_WARRANTY_MONTHS_DEFAULT;
    const mosWarrantyEnd = addMonthsToDate(site.commissioningDate, mosWarrantyMonths);
    const inMosWarranty = now <= mosWarrantyEnd;
    const isHeatPumpHydraulic = report.faultTypeId === 'HEAT-PUMP-FAULT' && isHydraulicCode(report.errorCode);

    if (inMosWarranty) {
      result = decision('RULE_WITHIN_MOS_WARRANTY', {
        party: 'plumbing-team',
        priority: faultType.priority,
        chargeable: false,
        aiMode: report.faultTypeId === 'HEAT-PUMP-FAULT' ? 'human' : 'assist',
        requiresSeniorPlumberSignOff: report.faultTypeId === 'HEAT-PUMP-FAULT',
        explanation: `Within MOS's 1-year plumbing warranty (commissioned ${site.commissioningDate}, expires ${fmt(mosWarrantyEnd)}) — send to Plumbing Team, no charge.${
          report.faultTypeId === 'HEAT-PUMP-FAULT'
            ? isHeatPumpHydraulic
              ? ' Error code indicates a hydraulic-side fault ("H- = Plumber Required", Heat Pump Decision Tree) — a senior plumber still confirms this is not a supplier warranty matter before attending.'
              : ' A senior plumber must confirm this is a hydraulic-side fault and not a supplier warranty matter before attending (no error code was given to check automatically).'
            : ''
        }`,
      });
    } else {
      const builderWarrantyEnd = site.builderWarrantyMonths ? addMonthsToDate(site.commissioningDate, site.builderWarrantyMonths) : null;
      const inBuilderWarranty = builderWarrantyEnd && now <= builderWarrantyEnd;
      if (inBuilderWarranty) {
        result = decision('RULE_BUILDER_WARRANTY_RECHARGE', {
          party: 'plumbing-team',
          priority: faultType.priority,
          chargeable: true,
          chargeParty: 'builder',
          aiMode: 'assist',
          requiresSeniorPlumberSignOff: report.faultTypeId === 'HEAT-PUMP-FAULT',
          explanation: `Past MOS's 1-year plumbing warranty (expired ${fmt(mosWarrantyEnd)}) but within ${site.builderName}'s own warranty (expires ${fmt(builderWarrantyEnd)}). "Builders Warranties are longer than our 1 year Plumbing Warranty — call outs during this period are chargeable to the Builder" (Aftercare Call Guide — over 1 year warranty). MOS still attends; recharge to the builder at month end.`,
        });
      } else {
        result = decision('RULE_OUT_OF_WARRANTY_CHARGEABLE', {
          party: 'plumber-review-chargeable',
          priority: faultType.priority,
          chargeable: true,
          chargeParty: 'homeowner',
          aiMode: 'assist',
          requiresSeniorPlumberSignOff: report.faultTypeId === 'HEAT-PUMP-FAULT',
          explanation: `Past MOS's 1-year plumbing warranty (expired ${fmt(mosWarrantyEnd)})${
            site.builderWarrantyMonths ? `, and past ${site.builderName}'s warranty too` : ', with no applicable builder warranty'
          }. "Plumber attendance after 1 year is chargeable unless covered by a Heat Pump warranty" (Aftercare Call Guide — over 1 year warranty). Customer to be informed of the charge before a visit is scheduled.`,
        });
      }
    }
  }

  // Repeat-visit visibility — MOS's own problem summary, item 7: "We cannot see the
  // pattern. How many calls, which houses we keep returning to." No time window in
  // the source documents, so this counts all prior tickets for the site.
  if (priorHistory.length >= 2) {
    result.repeatFault = true;
    result.repeatFaultCount = priorHistory.length;
    result.explanation += ` This is call ${priorHistory.length + 1} logged against this house — flagged for pattern review ("which houses we keep returning to").`;
  }

  // Evidence gating — MOS's own reminder: "Gather as much information as possible
  // ... the more information collected, the less chance of unnecessary return
  // visits." The ticket is still raised (nothing gets lost), but marked incomplete
  // until the fault type's required evidence is attached.
  const missingFields = new Set(result.missingFields || []);
  if (faultType.requiresPhoto && (!report.photos || report.photos.length === 0)) missingFields.add('photo');
  if (faultType.requiresErrorCode && !report.errorCode) missingFields.add('errorCode');
  if (faultType.requiresSerialNumber && !report.serialNumber) missingFields.add('serialNumber');
  if (missingFields.size > 0) {
    result.dataQuality = 'incomplete';
    result.missingFields = Array.from(missingFields);
  }

  return result;
}

function leakMatchesSnaggingChecklist(report) {
  const checklist = report.leakChecklist || {};
  return Object.keys(REFERENCE.leakSnaggingChecklist).some((key) => checklist[key]);
}

function isHydraulicCode(errorCode) {
  return /^H/i.test((errorCode || '').trim());
}

function isRefrigerantCode(errorCode) {
  return /^F/i.test((errorCode || '').trim());
}

module.exports = { triage, daysBetween };
