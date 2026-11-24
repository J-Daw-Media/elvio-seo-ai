import { stableId } from "./identity.js";
import { opportunityEvidenceCategories } from "./opportunityEvidence.js";

export const discoverySeedsV1 = Object.freeze([
  { topic: "Hoeveel uur heb je een DJ nodig op je bruiloft?", category: "wedding", terms: ["hoeveel", "uur", "dj", "bruiloft"], intent: "informational_commercial" },
  { topic: "Welke muziek past bij een bedrijfsfeest?", category: "corporate", terms: ["bedrijfsfeest", "muziek"], intent: "informational_commercial" },
  { topic: "Een DJ boeken voor een feest thuis", category: "private_party", terms: ["dj", "feest", "thuis"], intent: "commercial" },
  { topic: "Hoeveel ruimte heeft een DJ nodig?", category: "event_planning", terms: ["hoeveel", "ruimte", "dj"], intent: "informational_commercial" },
  { topic: "DJ of playlist voor je verjaardagsfeest?", category: "birthday", terms: ["dj", "playlist", "verjaardagsfeest"], intent: "comparison_commercial" },
  { topic: "Wanneer moet je een bruiloft-DJ boeken?", category: "wedding", terms: ["wanneer", "dj", "bruiloft", "boeken"], intent: "informational_commercial" },
  { topic: "Wat bespreek je vooraf met je DJ?", category: "event_planning", terms: ["vooraf", "dj", "bespreken"], intent: "informational_commercial" },
  { topic: "Muziek voor een personeelsfeest", category: "corporate", terms: ["muziek", "personeelsfeest"], intent: "informational_commercial" },
  { topic: "Feestmuziek voor verschillende leeftijdsgroepen", category: "event_planning", terms: ["muziek", "verschillende", "leeftijdsgroepen"], intent: "informational_commercial" },
  { topic: "Muziek en techniek voor een tuinfeest", category: "private_party", terms: ["muziek", "techniek", "tuinfeest"], intent: "informational_commercial" },
]);

const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value) => new Set(normalize(value).split(/\s+/).filter((item) => item.length > 2));

function aggregateQueries(evidence = []) {
  const queries = new Map();
  for (const item of evidence) {
    if (item?.source !== "google_search_console" || !item.keyword) continue;
    const key = normalize(item.keyword);
    const row = queries.get(key) || { query: item.keyword, impressions: 0, clicks: 0, refs: [], landingPages: new Set() };
    row.impressions += Number(item.metrics?.impressions || 0);
    row.clicks += Number(item.metrics?.clicks || 0);
    row.refs.push(item.id);
    if (item.landingPage) row.landingPages.add(item.landingPage);
    queries.set(key, row);
  }
  return [...queries.values()].map((item) => ({ ...item, landingPages: [...item.landingPages] }));
}

function relevance(seed, query) {
  const queryTokens = tokens(query.query);
  const matched = seed.terms.filter((term) => queryTokens.has(normalize(term))).length;
  return matched / Math.max(seed.terms.length, 1);
}

function overlapsExisting(seed, existingContent = []) {
  const seedTokens = tokens(seed.topic);
  return existingContent.map((item) => {
    const other = tokens(`${item.title || ""} ${item.slug || ""}`);
    const intersection = [...seedTokens].filter((word) => other.has(word)).length;
    return { item, similarity: intersection / Math.max(new Set([...seedTokens, ...other]).size, 1) };
  }).sort((a, b) => b.similarity - a.similarity)[0] || { item: null, similarity: 0 };
}

export function discoverOpportunities({ evidence = [], existingContent = [], seeds = discoverySeedsV1, sourceFingerprint, evaluatedAt = new Date().toISOString() } = {}) {
  const queries = aggregateQueries(evidence);
  return seeds.map((seed) => {
    const related = queries.map((query) => ({ ...query, relevance: relevance(seed, query) }))
      .filter((query) => query.relevance >= 0.45)
      .sort((a, b) => b.relevance - a.relevance || b.impressions - a.impressions);
    const overlap = overlapsExisting(seed, existingContent);
    const firstPartyImpressions = related.reduce((sum, item) => sum + item.impressions, 0);
    const evidenceFactors = [];
    if (related.length) evidenceFactors.push({ type: "related_first_party_search", ref: related[0].refs[0], detail: related[0].query });
    evidenceFactors.push({ type: "commercial_search_intent", ref: `intent:${seed.intent}` });
    if (overlap.similarity < 0.45) evidenceFactors.push({ type: "site_content_gap", ref: `inventory:${sourceFingerprint || "unknown"}` });
    evidenceFactors.push({ type: "distinct_editorial_value", ref: `seed:${stableId("seo-research-seed", seed)}` });
    evidenceFactors.push({ type: "verified_service_connection", ref: `service:${seed.category}` });
    const supported = related.length > 0 && overlap.similarity < 0.45;
    const state = supported ? "eligible_for_generation" : related.length ? "existing_page_optimization_recommended" : "research_pending";
    const id = stableId("seo-autopilot-candidate", { topic: seed.topic, sourceFingerprint });
    return {
      id, stableArticleId: stableId("seo-article", { topic: seed.topic }), topic: seed.topic,
      category: seed.category, searchIntent: seed.intent, commercialObjective: "qualified_direct_inquiry",
      evidenceCategory: opportunityEvidenceCategories.exploratory, evidenceFactors,
      evidenceStrength: supported ? "sufficient" : "insufficient", firstPartyImpressions,
      relatedQueries: related.slice(0, 5).map(({ refs: _refs, landingPages, ...item }) => ({ ...item, landingPages })),
      existingContentOverlap: overlap.item ? { id: overlap.item.id || null, title: overlap.item.title, slug: overlap.item.slug, similarity: overlap.similarity } : null,
      cannibalizationRisk: overlap.similarity >= 0.45 ? "high" : "low",
      existingPageBetterTarget: overlap.similarity >= 0.45,
      opportunityScore: Math.min(100, 45 + Math.min(25, firstPartyImpressions) + (supported ? 15 : 0)),
      evidenceEvaluatedAt: evaluatedAt, evaluatedAt, sourceFingerprint: sourceFingerprint || null,
      state, reason: supported ? "traceable_exploratory_evidence" : related.length ? "existing_content_overlap" : "first_party_evidence_missing",
    };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore || a.id.localeCompare(b.id));
}

