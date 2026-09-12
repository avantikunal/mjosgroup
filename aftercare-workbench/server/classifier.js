/**
 * Voice/text intake extractor — stands in for the AI voice assistant's language
 * understanding step.
 *
 * This is deliberately a deterministic, regex-based stub rather than a call to an
 * external model: it keeps the demonstrator dependency-free and its behaviour
 * inspectable, and it defines the exact contract (structured fields + confidence +
 * evidence, one field at a time) that a real ASR/LLM pipeline would need to satisfy to
 * drop in behind the same API route without changing the triage engine or the UI.
 * See docs/PRD.md "AI voice assistant" for the production swap-in plan.
 */

const FAULT_PATTERNS = [
  { faultTypeId: 'SAFETY-GAS', score: 0.99, patterns: [/\bsmell(?:s|ing)? (?:of )?gas\b/i, /\bgas leak\b/i, /\brotten egg(?:s)? smell\b/i] },
  { faultTypeId: 'SAFETY-CO', score: 0.99, patterns: [/\bcarbon monoxide\b/i, /\bco alarm\b/i, /\bco detector\b/i] },
  { faultTypeId: 'LEAK', score: 0.92, patterns: [/\bleak(?:ing|s)?\b/i, /\bdrip(?:ping)?\b/i, /\bwater (?:on|pooling on) the floor\b/i] },
  { faultTypeId: 'HEAT-NONE', score: 0.9, patterns: [/\bno heat(?:ing)?\b/i, /\bno hot water\b/i, /\bcold radiators?\b/i, /\bnothing('?s| is) working\b/i] },
  { faultTypeId: 'HP-FAULT', score: 0.88, patterns: [/\bheat pump\b/i, /\boutdoor unit\b/i, /\bflashing (?:red |amber )?light\b/i] },
  { faultTypeId: 'BOILER-FAULT', score: 0.85, patterns: [/\bboiler\b/i, /\block\s*-?out\b/i, /\bpressure (?:dropped|low)\b/i] },
  { faultTypeId: 'CONTROLS', score: 0.8, patterns: [/\bthermostat\b/i, /\bapp (?:won't|wont|not) connect\b/i, /\bwifi\b/i, /\bcontrols?\b/i] },
  { faultTypeId: 'NOISE', score: 0.75, patterns: [/\bnoise\b/i, /\bbanging\b/i, /\bbuzzing\b/i, /\brattl(?:e|ing)\b/i] },
  { faultTypeId: 'MVHR-FILTER', score: 0.8, patterns: [/\bmvhr\b/i, /\bventilation\b/i, /\bfilter\b/i] },
  { faultTypeId: 'ANNUAL-SERVICE', score: 0.85, patterns: [/\bannual service\b/i, /\bdue (?:a |for )?service\b/i, /\bmaintenance\b/i] },
];

const ERROR_CODE_PATTERN = /\b(?:error|fault|code)\s*[:#]?\s*([A-Z]{0,2}\d{1,4}[A-Z]?)\b/i;
const PHONE_PATTERN = /\b0\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}\b/;

/**
 * @param {string} transcript - free text (from speech-to-text or a typed note)
 * @param {object[]} sites - candidate sites to match against, from server/data.js
 */
function classifyIntake(transcript, sites) {
  const text = (transcript || '').trim();

  let bestFault = { faultTypeId: 'OTHER', score: 0.3, evidence: [] };
  for (const candidate of FAULT_PATTERNS) {
    const evidence = candidate.patterns.filter((p) => p.test(text)).map((p) => p.source);
    if (evidence.length > 0 && candidate.score > bestFault.score) {
      bestFault = { faultTypeId: candidate.faultTypeId, score: candidate.score, evidence };
    }
  }

  const errorCodeMatch = text.match(ERROR_CODE_PATTERN);
  const phoneMatch = text.match(PHONE_PATTERN);

  // Site match: look for a phone number or an address fragment mentioned in the transcript.
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

  const gasSmell = /\bsmell(?:s|ing)? (?:of )?gas\b|\bgas leak\b/i.test(text);
  const coAlarm = /\bcarbon monoxide\b|\bco alarm\b/i.test(text);

  return {
    schemaVersion: '1.0',
    modelVersion: 'voice-intake-stub-classifier-2026-09-01',
    transcript: text,
    faultType: { value: bestFault.faultTypeId, score: bestFault.score, evidence: bestFault.evidence },
    errorCode: errorCodeMatch ? errorCodeMatch[1].toUpperCase() : null,
    site: bestSite,
    safetyFlags: { gasSmell, coAlarm },
    requiresHumanReview: bestFault.score < 0.75 || !bestSite || gasSmell || coAlarm,
  };
}

module.exports = { classifyIntake };
