/**
 * Voice/text intake extractor — stands in for the AI voice assistant's language
 * understanding step ("AI voice picks up for the people who will ring no matter
 * what, and holds a normal conversation" — MOS Mechanical Aftercare Pitch, p.6).
 *
 * This is deliberately a deterministic, regex-based stub rather than a call to an
 * external model: it keeps the demonstrator dependency-free and its behaviour
 * inspectable, and it defines the exact contract (structured fields + confidence +
 * evidence, one field at a time) that a real ASR/LLM pipeline would need to satisfy
 * to drop in behind the same API route without changing the triage engine or the
 * UI. See docs/PRD.md "AI voice assistant" for the production swap-in plan.
 */

const FAULT_PATTERNS = [
  { faultTypeId: 'LEAK-INGRESS', score: 0.92, patterns: [/\bleak(?:ing|s)?\b/i, /\bdrip(?:ping)?\b/i, /\boverflow(?:ing)?\b/i, /\bdamp\b/i, /\bwater (?:on|coming (?:in|through)) the (?:ceiling|floor|wall)\b/i, /\bwater (?:is )?coming in\b/i, /\bwater ingress\b/i] },
  { faultTypeId: 'HEAT-PUMP-FAULT', score: 0.88, patterns: [/\bheat pump\b/i, /\boutdoor unit\b/i, /\bflashing (?:red |amber )?light\b/i, /\berror code\b/i] },
  { faultTypeId: 'NO-HEATING', score: 0.9, patterns: [/\bno heat(?:ing)?\b/i, /\bradiators? (?:are )?cold\b/i, /\bheating (?:not|isn'?t|won'?t) come? on\b/i, /\bunderfloor heating\b/i] },
  { faultTypeId: 'NO-HOT-WATER', score: 0.9, patterns: [/\bno hot water\b/i, /\bwater('?s| is)? not hot\b/i, /\bhot water running out\b/i] },
  { faultTypeId: 'OTHER-QUERY', score: 0.6, patterns: [/\bhow do i\b/i, /\bhow to use\b/i, /\bsettings?\b/i, /\brunning costs?\b/i, /\bgeneral question\b/i] },
];

// The Aftercare Call Triage Guide's builder/snagging checklist — a hit here on a
// leak call means Builder/Snagging regardless of warranty, so it's worth flagging
// even from a rough transcript.
const LEAK_CHECKLIST_PATTERNS = {
  roofLeak: /\broof\b/i,
  showerTraySealFailure: /\bshower tray\b/i,
  externalDrainBlocked: /\b(external|outside) drain\b|\bwaste pipe\b/i,
  waterIngressBuildingFabric: /\bbuilding fabric\b|\bwall\b|\brender\b/i,
  skylightWindowLeak: /\bskylight\b|\bwindow\b/i,
};

// Heat Pump Decision Tree, Error Code Guide: "Panasonic Error beginning with H- =
// Plumber Required" / "F- or F Gas = Warranty Call Required".
const ERROR_CODE_PATTERN = /\b(?:error|fault|code)\s*[:#]?\s*([A-Z]{0,2}\d{1,4}[A-Z]?)\b/i;
const PHONE_PATTERN = /\b0\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}\b/;

/**
 * @param {string} transcript - free text (from speech-to-text or a typed note)
 * @param {object[]} sites - candidate sites to match against, from server/data.js
 */
function classifyIntake(transcript, sites) {
  const text = (transcript || '').trim();

  let bestFault = { faultTypeId: 'OTHER-QUERY', score: 0.3, evidence: [] };
  for (const candidate of FAULT_PATTERNS) {
    const evidence = candidate.patterns.filter((p) => p.test(text)).map((p) => p.source);
    if (evidence.length > 0 && candidate.score > bestFault.score) {
      bestFault = { faultTypeId: candidate.faultTypeId, score: candidate.score, evidence };
    }
  }

  const leakChecklist = {};
  const leakChecklistHits = [];
  for (const [key, pattern] of Object.entries(LEAK_CHECKLIST_PATTERNS)) {
    if (pattern.test(text)) {
      leakChecklist[key] = true;
      leakChecklistHits.push(key);
    }
  }

  const errorCodeMatch = text.match(ERROR_CODE_PATTERN);
  const errorCode = errorCodeMatch ? errorCodeMatch[1].toUpperCase() : null;
  const phoneMatch = text.match(PHONE_PATTERN);

  // Site match: look for a phone number or a name/address fragment mentioned in the transcript.
  let bestSite = null;
  let bestSiteScore = 0;
  for (const site of sites) {
    let score = 0;
    const evidence = [];
    if (phoneMatch && site.phone.replace(/\s/g, '') === phoneMatch[0].replace(/\s/g, '')) {
      score = 0.97;
      evidence.push('PHONE_NUMBER_MATCH');
    } else {
      const addressWords = site.address.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 3);
      const matchedAddressWords = addressWords.filter((w) => text.toLowerCase().includes(w));
      if (matchedAddressWords.length >= 2) {
        score = 0.6 + Math.min(matchedAddressWords.length * 0.08, 0.3);
        evidence.push(`ADDRESS_WORDS:${matchedAddressWords.join('|')}`);
      }

      const nameWords = site.customerName.toLowerCase().split(/[\s&]+/).filter((w) => w.length > 2);
      const matchedNameWords = nameWords.filter((w) => text.toLowerCase().includes(w));
      if (matchedNameWords.length >= 2) {
        const nameScore = 0.65 + Math.min(matchedNameWords.length * 0.08, 0.25);
        if (nameScore > score) {
          score = nameScore;
          evidence.push(`NAME_WORDS:${matchedNameWords.join('|')}`);
        }
      }
    }
    if (score > bestSiteScore) {
      bestSiteScore = score;
      bestSite = { siteId: site.siteId, score, evidence };
    }
  }

  return {
    schemaVersion: '1.0',
    modelVersion: 'voice-intake-stub-classifier-2026-09-01',
    transcript: text,
    faultType: { value: bestFault.faultTypeId, score: bestFault.score, evidence: bestFault.evidence },
    errorCode,
    errorCodeMeaning: bestFault.faultTypeId === 'HEAT-PUMP-FAULT' ? describeHeatPumpCode(errorCode) : null,
    leakChecklist,
    leakChecklistHits,
    site: bestSite,
    requiresHumanReview: bestFault.score < 0.75 || !bestSite,
  };
}

function describeHeatPumpCode(errorCode) {
  if (!errorCode) return null;
  if (/^H/i.test(errorCode)) return 'Hydraulic fault (H-) — plumber required (Heat Pump Decision Tree)';
  if (/^F/i.test(errorCode)) return 'Refrigerant/F Gas fault (F-) — warranty call required (Heat Pump Decision Tree)';
  return null;
}

module.exports = { classifyIntake };
