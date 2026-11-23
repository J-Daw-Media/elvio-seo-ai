export const opportunityEvidenceCategories = Object.freeze({
  established: "established_search_opportunity",
  exploratory: "evidence_backed_exploratory_opportunity",
});

const exploratoryEvidenceTypes = new Set([
  "related_first_party_search",
  "verified_customer_question",
  "commercial_search_intent",
  "site_content_gap",
  "seasonal_relevance",
  "verified_external_search_evidence",
  "distinct_editorial_value",
  "verified_service_connection",
]);

export function classifyOpportunityEvidence(opportunity = {}) {
  const requestedCategory = opportunity.evidenceCategory || opportunityEvidenceCategories.established;
  const factors = Array.isArray(opportunity.evidenceFactors) ? opportunity.evidenceFactors : [];
  const traceable = factors.filter((item) => item && typeof item.ref === "string" && item.ref.trim() && typeof item.type === "string");
  const types = new Set(traceable.map((item) => item.type));

  if (requestedCategory === opportunityEvidenceCategories.established) {
    const legacySupported = opportunity.evidenceStrength === "sufficient";
    const directEvidence = types.has("direct_first_party_search") || types.has("existing_landing_page_performance");
    return {
      category: requestedCategory,
      sufficient: legacySupported || directEvidence,
      evidenceFactorCount: traceable.length,
      evidenceTypes: [...types].sort(),
      reason: legacySupported || directEvidence ? "established_first_party_evidence" : "established_evidence_missing",
    };
  }

  if (requestedCategory !== opportunityEvidenceCategories.exploratory) {
    return { category: requestedCategory, sufficient: false, evidenceFactorCount: traceable.length, evidenceTypes: [...types].sort(), reason: "evidence_category_invalid" };
  }

  const supportedTypes = [...types].filter((type) => exploratoryEvidenceTypes.has(type));
  const hasRequiredFoundation = types.has("related_first_party_search")
    && types.has("commercial_search_intent")
    && types.has("site_content_gap")
    && types.has("distinct_editorial_value")
    && types.has("verified_service_connection");
  return {
    category: requestedCategory,
    sufficient: hasRequiredFoundation && supportedTypes.length >= 5,
    evidenceFactorCount: traceable.length,
    evidenceTypes: supportedTypes.sort(),
    reason: hasRequiredFoundation && supportedTypes.length >= 5 ? "exploratory_evidence_bundle_sufficient" : "exploratory_evidence_bundle_insufficient",
  };
}

export function isExploratoryOpportunity(opportunity = {}) {
  return (opportunity.evidenceCategory || opportunityEvidenceCategories.established) === opportunityEvidenceCategories.exploratory;
}
