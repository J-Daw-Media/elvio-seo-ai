import { stableId } from "./identity.js";

export function classifyIndexingFinding(input = {}) {
  const reason = String(input.reason || "unknown").toLowerCase();
  const intentionalSignal = Boolean(input.intentional) || /redirect|alternate page|not found|blocked by robots/.test(reason);
  return {
    id: stableId("indexing-finding", { url: input.url, reason }),
    url: input.url,
    observedStatus: input.observedStatus || "unknown",
    source: input.source || "unavailable",
    canonical: input.canonical || null,
    indexabilitySignals: input.indexabilitySignals || [],
    likelyCause: input.likelyCause || null,
    intentionalExclusion: intentionalSignal ? "likely" : "unknown",
    recommendedAction: intentionalSignal ? "verify_intent_only" : "read_only_url_investigation",
    confidence: input.confidence || "low",
    automaticChangeAllowed: false,
  };
}

export function structuredDataDiagnosis(page = {}) {
  const types = new Set(page.jsonLdTypes || []);
  const findings = [];
  if (types.has("Event") && !page.hasActualScheduledEvent) findings.push({
    code: "event_schema_without_scheduled_event",
    sourceUrl: page.url,
    currentType: "Event",
    recommendation: "Remove Event markup from this evergreen page; use only truthful types supported by visible content.",
    candidateTypes: ["Service", "LocalBusiness", "FAQPage"],
    confidence: "high",
    ownerApprovalRequired: true,
  });
  return findings;
}

export function headingDiagnosis(page = {}) {
  const count = (page.h1s || []).length;
  return count === 1
    ? { url: page.url, status: "healthy", count, changeRequired: false }
    : { url: page.url, status: count ? "multiple_h1" : "missing_h1", count, changeRequired: true, ownerApprovalRequired: true };
}

export function overlapAssessment(a = {}, b = {}) {
  const terms = (value) => new Set(String(value || "").toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((word) => word.length > 3));
  const left = terms(`${a.title} ${a.description}`); const right = terms(`${b.title} ${b.description}`);
  const shared = [...left].filter((word) => right.has(word));
  const similarity = Math.round((shared.length / Math.max(1, new Set([...left, ...right]).size)) * 100);
  return { pages: [a.url, b.url], similarity, sharedTerms: shared, risk: similarity >= 45 ? "review_for_cannibalization" : "low", automaticConsolidationAllowed: false };
}
