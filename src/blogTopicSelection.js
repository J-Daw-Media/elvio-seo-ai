import { classifyOpportunityEvidence, isExploratoryOpportunity } from "./opportunityEvidence.js";

export function selectAutopilotTopics({ opportunities = [], publishedTopics = [], now = new Date(), maximum = 6, exploratoryMaximum = 2 } = {}) {
  const published = new Set(publishedTopics.map(normalize));
  const rejected = [];
  const eligible = [];
  for (const item of opportunities) {
    const reasons = [];
    const topic = normalize(item.topic);
    if (!item.id || !topic) reasons.push("topic_identity_missing");
    if (published.has(topic) || item.duplicateMatch) reasons.push("duplicate_topic");
    if (item.cannibalizationRisk && item.cannibalizationRisk !== "low") reasons.push("cannibalization_risk");
    if (item.existingPageBetterTarget) reasons.push("existing_page_better_target");
    const evidence = classifyOpportunityEvidence(item);
    if (!evidence.sufficient) reasons.push(isExploratoryOpportunity(item) ? "insufficient_exploratory_evidence" : "insufficient_search_demand");
    if (!item.searchIntent || !item.commercialObjective) reasons.push("intent_or_commercial_objective_missing");
    const evaluatedAt = new Date(item.evaluatedAt || "invalid");
    if (Number.isNaN(evaluatedAt.getTime()) || now.getTime() - evaluatedAt.getTime() > 31 * 86_400_000) reasons.push("evidence_stale");
    if (item.scheduleFiller) reasons.push("schedule_filler_topic_rejected");
    if (reasons.length) rejected.push({ id: item.id || null, topic: item.topic || null, reasons });
    else eligible.push({ ...item, evidenceDecision: evidence });
  }
  eligible.sort((a, b) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0) || String(a.id).localeCompare(String(b.id)));
  const limit = Math.max(0, Math.min(maximum, 6));
  const exploratoryLimit = Math.max(0, Math.min(exploratoryMaximum, 2));
  const selected = [];
  let exploratoryCount = 0;
  for (const item of eligible) {
    if (selected.length >= limit) break;
    if (isExploratoryOpportunity(item)) {
      if (exploratoryCount >= exploratoryLimit) {
        rejected.push({ id: item.id, topic: item.topic, reasons: ["exploratory_monthly_limit_reached"] });
        continue;
      }
      exploratoryCount += 1;
    }
    selected.push(item);
  }
  return { selected, rejected, exploratorySelected: exploratoryCount, exploratoryLimit, unfilledCapacity: Math.max(0, limit - selected.length) };
}

function normalize(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim(); }

