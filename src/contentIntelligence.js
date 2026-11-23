import { stableId } from "./identity.js";

export const opportunityWeights = Object.freeze({ commercialRelevance: 0.18, searchIntent: 0.14, evidenceStrength: 0.15, existingVisibility: 0.08, serviceFit: 0.12, conversionRelevance: 0.12, coverageGap: 0.08, competitionFeasibility: 0.05, implementationEase: 0.04, duplicationSafety: 0.04 });
const bounded = (value) => Math.max(0, Math.min(100, Number(value) || 0));

export function evaluateOpportunity(input = {}) {
  if (!input.topic) throw new Error("opportunity_topic_required");
  const dimensions = Object.fromEntries(Object.keys(opportunityWeights).map((key) => [key, bounded(input[key])]));
  const score = Math.round(Object.entries(opportunityWeights).reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0));
  const evidenceLimited = dimensions.evidenceStrength < 50;
  const existingPage = input.existingPage || null;
  const action = input.noActionNeeded ? "no_action_needed" : existingPage ? "optimize_existing_page" : evidenceLimited ? "research_before_content" : "create_new_page_or_article";
  return {
    id: stableId("phase2-opportunity", { topic: String(input.topic).toLowerCase(), existingPage }),
    topic: input.topic, eventCategory: input.eventCategory || "unknown", existingPage, dimensions, score,
    evidenceLimited, recommendedAction: action, cannibalizationRisk: input.cannibalizationRisk || "unassessed",
    limitations: evidenceLimited ? ["Evidence is insufficient for an automatic content recommendation."] : [],
    predictedRanking: null, predictedTraffic: null, predictedRevenue: null, publishReady: false,
  };
}

export function initialPhase2Opportunities() {
  const rows = [
    ["DJ huren Amsterdam", "local", "/dj-huren-nederland", 92, 95, 82, 70, 95, 86, 35],
    ["DJ prijzen en pakketten", "pricing", "/wat-kost-een-dj-per-uur", 90, 96, 86, 65, 94, 90, 45],
    ["All-in bruiloft DJ", "wedding", "/bruiloftsfeest", 88, 92, 74, 60, 94, 86, 55],
    ["DJ voor bedrijfsfeest en personeelsfeest", "corporate", "/bedrijfsfeest", 90, 90, 72, 58, 96, 90, 55],
    ["DJ voor sportevenement", "sports", "/sportevenement", 70, 80, 76, 62, 78, 66, 50],
    ["Dagprogramma bruiloft", "wedding-information", "/post/dagprogramma-bruiloft", 66, 62, 84, 70, 76, 65, 35],
    ["Klein verjaardagsfeest of privéfeest", "private", null, 58, 72, 35, 20, 82, 60, 75],
  ];
  return rows.map(([topic, eventCategory, existingPage, commercialRelevance, searchIntent, evidenceStrength, existingVisibility, serviceFit, conversionRelevance, coverageGap]) => evaluateOpportunity({
    topic, eventCategory, existingPage, commercialRelevance, searchIntent, evidenceStrength, existingVisibility, serviceFit, conversionRelevance, coverageGap,
    competitionFeasibility: 60, implementationEase: existingPage ? 80 : 45, duplicationSafety: existingPage ? 90 : 45,
  })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function buildSeoBrief(opportunity, evidence = {}) {
  return {
    id: stableId("seo-brief", { opportunityId: opportunity.id, version: 1 }), opportunityId: opportunity.id,
    targetSearchIntent: opportunity.dimensions.searchIntent >= 75 ? "commercial" : "informational_with_commercial_path",
    primaryTopic: opportunity.topic, supportingQueries: evidence.supportingQueries || [], intendedAudience: evidence.audience || "Prospective DJ Elvio customers",
    commercialObjective: "Increase qualified direct quotation requests, not traffic alone.",
    recommendation: opportunity.recommendedAction, targetPage: opportunity.existingPage,
    proposedTitle: evidence.proposedTitle || opportunity.topic, proposedMetaDescription: evidence.proposedMetaDescription || null,
    headingOutline: evidence.headingOutline || [`H1: ${opportunity.topic}`, "H2: Mogelijkheden", "H2: Voorbereiding en techniek", "H2: Offerte aanvragen"],
    questionsToAnswer: evidence.questionsToAnswer || ["Wat is inbegrepen?", "Welke informatie is nodig voor een offerte?", "Welke servicevorm past bij het evenement?"],
    internalLinks: evidence.internalLinks || ["/contact"], callToAction: "Vraag vrijblijvend een offerte aan.",
    factualVerification: ["service format", "current package rules", "authoritative pricing if prices are mentioned"],
    sourceEvidence: evidence.sourceEvidence || [], cannibalizationAssessment: opportunity.cannibalizationRisk,
    confidence: opportunity.evidenceLimited ? "limited" : "supported", limitations: opportunity.limitations,
    status: "draft_only", publishReady: false,
  };
}
