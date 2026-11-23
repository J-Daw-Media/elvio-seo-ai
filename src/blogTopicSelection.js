export function selectAutopilotTopics({ opportunities = [], publishedTopics = [], now = new Date(), maximum = 2 } = {}) {
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
    if (item.evidenceStrength !== "sufficient") reasons.push("insufficient_search_demand");
    if (!item.searchIntent || !item.commercialObjective) reasons.push("intent_or_commercial_objective_missing");
    const evaluatedAt = new Date(item.evaluatedAt || "invalid");
    if (Number.isNaN(evaluatedAt.getTime()) || now.getTime() - evaluatedAt.getTime() > 31 * 86_400_000) reasons.push("evidence_stale");
    if (item.scheduleFiller) reasons.push("schedule_filler_topic_rejected");
    if (reasons.length) rejected.push({ id: item.id || null, topic: item.topic || null, reasons });
    else eligible.push(item);
  }
  eligible.sort((a, b) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0) || String(a.id).localeCompare(String(b.id)));
  return { selected: eligible.slice(0, Math.max(0, Math.min(maximum, 2))), rejected, unfilledCapacity: Math.max(0, Math.min(maximum, 2) - eligible.length) };
}

function normalize(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim(); }

