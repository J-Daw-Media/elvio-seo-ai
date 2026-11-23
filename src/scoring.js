import { stableId } from "./identity.js";

const WEIGHTS = Object.freeze({
  firstPartyDemand: 0.22,
  commercialIntent: 0.20,
  siteCoverageGap: 0.12,
  rankingFeasibility: 0.10,
  evidenceConfidence: 0.12,
  geographicRelevance: 0.08,
  seasonality: 0.06,
  potentialBookingValue: 0.10,
});

function bounded(value) { return Math.min(100, Math.max(0, Number(value) || 0)); }

export function scoreOpportunity(input) {
  const dimensions = Object.fromEntries(Object.keys(WEIGHTS).map((key) => [key, bounded(input[key])]));
  const score = Math.round(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0));
  const evidenceLimited = dimensions.evidenceConfidence < 50 || dimensions.firstPartyDemand < 25;
  const record = {
    topic: String(input.topic || "").trim(),
    eventCategory: String(input.eventCategory || "unknown"),
    landingPage: input.landingPage || null,
    dimensions,
    score,
    evidenceLimited,
    interpretation: evidenceLimited ? "Priority is provisional because first-party evidence is limited." : "Priority is supported by first-party evidence.",
    sendOrPublishReady: false,
  };
  if (!record.topic) throw new Error("opportunity_topic_required");
  return { id: stableId("opportunity", { topic: record.topic.toLowerCase(), eventCategory: record.eventCategory, landingPage: record.landingPage }), ...record };
}

export function deduplicateOpportunities(items) {
  const best = new Map();
  for (const item of items) {
    const normalized = item.id ? item : scoreOpportunity(item);
    if (!best.has(normalized.id) || best.get(normalized.id).score < normalized.score) best.set(normalized.id, normalized);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export const scoringWeights = WEIGHTS;
