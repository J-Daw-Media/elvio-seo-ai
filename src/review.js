import { stableId, sha256 } from "./identity.js";
const DECISIONS = new Set(["approve", "request_revision", "reject", "defer"]);
export function createReviewPackage({ draft, brief, imagery = [], evidence = [] } = {}) {
  const fingerprint = sha256(draft);
  return {
    id: stableId("seo-review-package", { fingerprint }), fingerprint, draft, brief, imagery, evidence,
    commercialPurpose: brief.commercialObjective, overlap: brief.cannibalizationAssessment,
    factsRequiringConfirmation: draft.factsRequiringConfirmation, destination: draft.destination,
    approvalStatus: "pending_review", decision: null, publicationAuthorized: false,
  };
}
export function decideReview(item, { decision, reviewerId, decidedAt = new Date().toISOString() } = {}) {
  if (!DECISIONS.has(decision)) throw new Error("invalid_review_decision");
  if (!reviewerId) throw new Error("reviewer_required");
  return { ...structuredClone(item), approvalStatus: decision === "approve" ? "approved" : decision, decision, reviewerId, decidedAt };
}
export function approvalMatches(item, draft) { return item.approvalStatus === "approved" && item.fingerprint === sha256(draft); }
export function invalidateOnChange(item, draft) {
  if (item.fingerprint === sha256(draft)) return structuredClone(item);
  return { ...structuredClone(item), draft, fingerprint: sha256(draft), approvalStatus: "pending_review", decision: null, reviewerId: null, decidedAt: null, publicationAuthorized: false };
}
