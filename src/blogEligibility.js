import { blogAutopilotPolicyV1 } from "./blogAutopilotPolicy.js";

const requiredChecks = Object.freeze([
  "searchIntentIdentified", "traceableOpportunityEvidence", "commercialRelevanceDocumented",
  "duplicateCheckPassed", "cannibalizationCheckPassed", "existingPageNotBetterTarget",
  "internalLinksValid", "metadataComplete", "naturalProfessionalDutch", "usefulContent",
  "headingStructureValid", "keywordStuffingAbsent", "factualVerificationPassed",
  "unsupportedClaimsAbsent", "contentFingerprintValid",
]);

const restrictedCommercialChanges = Object.freeze(["pricing", "packages", "offers", "discounts", "booking_terms", "commercial_landing_pages", "lead_forms", "tracking"]);

export function evaluateAutopilotEligibility(candidate = {}, { policy = blogAutopilotPolicyV1, now = new Date(), killSwitch = true } = {}) {
  const failures = [];
  if (killSwitch) failures.push("kill_switch_active");
  if (!candidate.id || !candidate.contentFingerprint || !candidate.stableArticleId) failures.push("stable_identity_missing");
  for (const check of requiredChecks) if (candidate.checks?.[check] !== true) failures.push(check);
  const evidenceAt = new Date(candidate.evidenceEvaluatedAt || "invalid");
  if (Number.isNaN(evidenceAt.getTime()) || now.getTime() - evidenceAt.getTime() > 31 * 86_400_000) failures.push("seo_evidence_stale");
  if (candidate.opportunityEvidenceStrength !== "sufficient") failures.push("insufficient_search_demand");
  if (candidate.topicSelectedToFillSchedule === true) failures.push("schedule_filler_topic_rejected");
  if (candidate.requiredCommercialChanges?.some((item) => restrictedCommercialChanges.includes(item))) failures.push("commercial_change_requires_owner_review");
  if (candidate.image?.eligible !== true && policy.imageRequiredByDefault && !policy.imageFreeCategories.includes(candidate.contentCategory)) failures.push("eligible_image_required");
  if (candidate.image?.fabricatedEventPhotography) failures.push("fabricated_event_photography_rejected");
  const unique = [...new Set(failures)];
  return {
    policyId: policy.id, candidateId: candidate.id || null, eligible: unique.length === 0,
    decision: unique.length === 0 ? "eligible_for_autopilot" : unique.includes("commercial_change_requires_owner_review") ? "held_for_review" : "policy_rejected",
    reasons: unique, ownerNotificationRequired: unique.length > 0 && policy.ownerNotificationOnHoldOrSkip,
    evaluatedAt: new Date(now).toISOString(), publicationAuthorized: false,
  };
}

export { requiredChecks as autopilotRequiredChecks, restrictedCommercialChanges };

