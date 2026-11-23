import { stableId } from "./identity.js";
import { blogAutopilotPolicyV1, evaluatePublicationWindow } from "./blogAutopilotPolicy.js";

export const publicationExecutorContract = Object.freeze({
  mode: "development_only",
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
  policyId: blogAutopilotPolicyV1.id,
  recurringResearchIdentityAllowed: false,
  crmAccess: false,
  googleAdsMutationAccess: false,
  customerCommunicationAccess: false,
  globalGrooveAccess: false,
  productionRequestEnabled: false,
});

export function buildPublicationPlan({ candidate, decision, instant, killSwitch = true, monthlyRecords = [], slotRecords = [] } = {}) {
  if (publicationExecutorContract.productionRequestEnabled) throw new Error("PUBLICATION_EXECUTOR_MUST_REMAIN_DISABLED_IN_DEVELOPMENT");
  if (decision?.eligible !== true || decision.policyId !== publicationExecutorContract.policyId) return { executable: false, reason: "candidate_not_eligible", policyDecision: decision || null };
  if (!candidate?.stableArticleId || !candidate?.contentFingerprint || !candidate?.wixDraftId) return { executable: false, reason: "publication_identity_incomplete", policyDecision: decision };
  const window = evaluatePublicationWindow({ instant, killSwitch, monthlyRecords, slotRecords });
  if (!window.allowed) return { executable: false, reason: window.reason, slot: window.slot, policyDecision: decision };
  return {
    executable: false,
    developmentReady: true,
    reason: "production_activation_not_authorized",
    siteId: publicationExecutorContract.siteId,
    slot: window.slot,
    articleId: candidate.stableArticleId,
    contentFingerprint: candidate.contentFingerprint,
    wixDraftId: candidate.wixDraftId,
    publicationAttemptId: stableId("wix-publication-attempt", { articleId: candidate.stableArticleId, contentFingerprint: candidate.contentFingerprint, slotKey: window.slot.key }),
    policyDecision: decision,
    requiredFutureSafeguards: ["durable_slot_reservation", "monthly_quota_recheck", "kill_switch_recheck", "read_after_write_verification", "uncertain_outcome_quarantine"],
  };
}

export function assertPublicationEndpointAllowed(url, method = "POST", expectedDraftId) {
  const parsed = new URL(url);
  const allowedPath = `/blog/v3/draft-posts/${encodeURIComponent(expectedDraftId)}/publish`;
  if (parsed.origin !== "https://www.wixapis.com" || parsed.pathname !== allowedPath || String(method).toUpperCase() !== "POST") throw new Error("WIX_PUBLICATION_ENDPOINT_NOT_ALLOWED");
  return true;
}

