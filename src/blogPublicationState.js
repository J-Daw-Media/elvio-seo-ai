export const blogPublicationStates = Object.freeze([
  "opportunity_identified", "research_verified", "article_generated", "content_validated", "eligible_for_autopilot",
  "wix_draft_creation_reserved", "wix_draft_verified", "publication_reserved", "publication_started", "published_verified", "monitoring",
  "held_for_review", "failed_before_request", "uncertain", "duplicate_blocked", "policy_rejected", "publication_verification_failed",
]);

const normal = Object.freeze({
  opportunity_identified: ["research_verified", "held_for_review", "policy_rejected"],
  research_verified: ["article_generated", "held_for_review", "policy_rejected"],
  article_generated: ["content_validated", "held_for_review", "policy_rejected"],
  content_validated: ["eligible_for_autopilot", "held_for_review", "policy_rejected"],
  eligible_for_autopilot: ["wix_draft_creation_reserved", "duplicate_blocked", "held_for_review"],
  wix_draft_creation_reserved: ["wix_draft_verified", "failed_before_request", "uncertain"],
  wix_draft_verified: ["publication_reserved", "held_for_review", "policy_rejected"],
  publication_reserved: ["publication_started", "failed_before_request", "uncertain"],
  publication_started: ["published_verified", "uncertain", "publication_verification_failed"],
  published_verified: ["monitoring"], monitoring: [], held_for_review: [], failed_before_request: [], uncertain: [], duplicate_blocked: [], policy_rejected: [], publication_verification_failed: [],
});

export function createPublicationRecord({ articleId, contentFingerprint, wixDraftId = null, policyDecision = null } = {}) {
  if (!articleId || !/^[a-f0-9]{64}$/i.test(String(contentFingerprint || ""))) throw new Error("PUBLICATION_IDENTITY_REQUIRED");
  return { articleId, contentFingerprint, wixDraftId, publicationAttemptId: null, policyDecision, state: "opportunity_identified", history: [], publicationAuthorized: false };
}

export function transitionPublication(record, next, evidence = {}) {
  if (!blogPublicationStates.includes(next) || !normal[record.state]?.includes(next)) throw new Error("PUBLICATION_STATE_TRANSITION_INVALID");
  if (next === "eligible_for_autopilot" && evidence.policyDecision?.eligible !== true) throw new Error("PUBLICATION_ELIGIBILITY_REQUIRED");
  if (next === "wix_draft_verified" && (!evidence.wixDraftId || evidence.retrievedFingerprint !== record.contentFingerprint)) throw new Error("PUBLICATION_DRAFT_VERIFICATION_REQUIRED");
  if (next === "publication_reserved" && (!evidence.slotKey || !evidence.publicationAttemptId)) throw new Error("PUBLICATION_RESERVATION_REQUIRED");
  if (next === "published_verified" && (!evidence.publicUrl || evidence.retrievedFingerprint !== record.contentFingerprint)) throw new Error("PUBLICATION_READ_AFTER_WRITE_REQUIRED");
  return { ...structuredClone(record), ...evidence, state: next, publicationAuthorized: false, history: [...(record.history || []), { from: record.state, to: next, at: evidence.at || new Date().toISOString(), evidenceId: evidence.evidenceId || null }] };
}

