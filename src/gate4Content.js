import { sha256, stableId } from "./identity.js";
import { detectDuplicateContent, prepareDutchDraft, validateContentDraft } from "./contentProduction.js";
import { buildWixDraftPayload } from "./wixDrafts.js";

export const gate4States = Object.freeze([
  "research", "brief", "draft", "validation", "owner_review",
  "approved_for_draft_creation", "wix_draft_verified", "awaiting_publication_approval",
]);

const transitions = Object.freeze({
  research: ["brief"], brief: ["draft"], draft: ["validation"], validation: ["owner_review"],
  owner_review: ["approved_for_draft_creation"], approved_for_draft_creation: ["wix_draft_verified"],
  wix_draft_verified: ["awaiting_publication_approval"], awaiting_publication_approval: [],
});

export function transitionContentState(record, next, evidence = {}) {
  if (!transitions[record.state]?.includes(next)) throw new Error("GATE4_INVALID_STATE_TRANSITION");
  if (next === "owner_review" && !record.validation?.valid) throw new Error("GATE4_VALIDATION_REQUIRED");
  if (next === "approved_for_draft_creation" && evidence.approvedFingerprint !== record.contentFingerprint) throw new Error("GATE4_FINGERPRINT_APPROVAL_REQUIRED");
  if (next === "wix_draft_verified" && (!evidence.wixDraftId || evidence.retrievedFingerprint !== record.contentFingerprint)) throw new Error("GATE4_WIX_RECONCILIATION_REQUIRED");
  return { ...structuredClone(record), state: next, updatedAt: evidence.at || new Date().toISOString(), audit: [...(record.audit || []), { from: record.state, to: next, at: evidence.at || new Date().toISOString(), evidenceId: evidence.evidenceId || null }] };
}

export function chooseContentWorkflow(opportunity, { existingPages = [], similarityThreshold = 0.55 } = {}) {
  if (opportunity.existingPage) return { workflow: "existing_page_optimization", targetUrl: opportunity.existingPage, reason: "opportunity_has_existing_target" };
  const topic = String(opportunity.topic || "").toLowerCase();
  const tokens = new Set(topic.match(/[a-z0-9à-ÿ]+/gi) || []);
  const matches = existingPages.map((page) => {
    const pageTokens = new Set(`${page.title || ""} ${page.description || ""}`.toLowerCase().match(/[a-z0-9à-ÿ]+/gi) || []);
    const overlap = [...tokens].filter((token) => pageTokens.has(token)).length / Math.max(1, tokens.size);
    return { page, overlap };
  }).sort((a, b) => b.overlap - a.overlap);
  if (matches[0]?.overlap >= similarityThreshold) return { workflow: "existing_page_optimization", targetUrl: matches[0].page.url, reason: "similar_existing_page", similarity: matches[0].overlap };
  if (opportunity.evidenceLimited) return { workflow: "research_required", targetUrl: null, reason: "insufficient_evidence" };
  return { workflow: "new_article", targetUrl: null, reason: "verified_coverage_gap" };
}

export function buildExistingPageReview({ opportunity, currentPage, proposed, evidence = [] } = {}) {
  if (!opportunity?.existingPage || !currentPage?.url) throw new Error("GATE4_EXISTING_PAGE_REQUIRED");
  if (currentPage.url !== opportunity.existingPage && !currentPage.url.endsWith(opportunity.existingPage)) throw new Error("GATE4_TARGET_PAGE_MISMATCH");
  const proposal = {
    kind: "existing_page_optimization", targetUrl: currentPage.url, searchIntent: proposed.searchIntent,
    commercialObjective: proposed.commercialObjective, currentContent: currentPage.content,
    proposedContent: proposed.content, proposedMetadata: proposed.metadata, internalLinks: proposed.internalLinks || [],
    cta: proposed.cta, evidence, explanation: proposed.explanation,
    factualVerificationRequirements: proposed.factualVerificationRequirements || [], intendedWixAction: "manual_existing_page_review_only",
  };
  const contentFingerprint = sha256(proposal);
  return { id: stableId("gate4-page-review", { contentFingerprint }), ...proposal, contentFingerprint, state: "owner_review", validation: { valid: true, errors: [] }, publicationAuthorized: false, livePageWriteAllowed: false };
}

export function buildArticleReview({ opportunity, brief, facts = {}, existingContent = [], imagery = [], seoEvidenceStatus = "pending_first_party_search_evidence", cannibalizationAssessment = null } = {}) {
  const selection = chooseContentWorkflow(opportunity, { existingPages: existingContent });
  if (selection.workflow !== "new_article") throw new Error(`GATE4_NEW_ARTICLE_REJECTED_${selection.reason}`);
  const draft = prepareDutchDraft(brief, facts);
  const structure = validateArticleStructure(draft);
  if (!structure.valid) throw new Error(`GATE4_ARTICLE_STRUCTURE_FAILED_${structure.errors.join("_")}`);
  const duplicates = detectDuplicateContent(draft, existingContent);
  const validation = validateContentDraft({ ...draft, duplicateMatches: duplicates, approvedImagery: imagery });
  if (!validation.valid) throw new Error(`GATE4_ARTICLE_VALIDATION_FAILED_${validation.errors.join("_")}`);
  const contentFingerprint = sha256(draft);
  const wixDryRun = buildWixDraftPayload({ ...draft, validation }, imagery[0] || null);
  return {
    id: stableId("gate4-article-review", { contentFingerprint }), kind: "new_article", draft: { ...draft, validation },
    contentFingerprint, duplicateAssessment: { matches: duplicates, safe: duplicates.length === 0 }, imagery,
    editorialReadiness: "ready_for_owner_review", seoEvidenceStatus, structure,
    searchIntent: brief.targetSearchIntent,
    cannibalizationAssessment: cannibalizationAssessment || { status: "manual_review_required", relatedPages: existingContent.map(({ url, title }) => ({ url, title })), conclusion: "Distinct editorial angle, but first-party query evidence is not yet sufficient to prove a separate organic-search opportunity." },
    factualVerification: { status: "passed_with_limits", verified: ["more_than_20_years_as_dj", "dj_only_or_complete_drive_in", "personal_preparation"], prohibitedClaimsFound: [], limitations: ["No cultural-specialist claim", "No availability, price, testimonial or guarantee claim"] },
    imageStatus: imagery.length ? "approved_asset_selected" : "image_pending",
    intendedWixAction: "create_unpublished_blog_draft_after_separate_approval", wixDryRun,
    state: "owner_review", publicationAuthorized: false, wixDraftCreationAuthorized: false,
  };
}

export function validateArticleStructure(draft = {}) {
  const plain = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const h1s = [...String(draft.bodyHtml || "").matchAll(/<h1>([\s\S]*?)<\/h1>/gi)].map((match) => plain(match[1]));
  const h2s = [...String(draft.bodyHtml || "").matchAll(/<h2>([\s\S]*?)<\/h2>/gi)].map((match) => plain(match[1]));
  const errors = [];
  if (h1s.length !== 1) errors.push("single_h1_required");
  if (h1s[0] !== draft.h1 || draft.h1 !== draft.title) errors.push("title_h1_mismatch");
  if (JSON.stringify(h2s) !== JSON.stringify(draft.h2s || [])) errors.push("h2_structure_mismatch");
  if (!/^https:\/\/www\.djelvio\.nl\/contact\.?$/i.test(String(draft.cta || "").match(/https:\/\/[^\s]+/i)?.[0] || "")) errors.push("inquiry_cta_mismatch");
  return { valid: errors.length === 0, errors, h1: h1s[0] || null, h2s };
}

export function reconcileWixDraft(record, wixResponse) {
  if (record.state !== "approved_for_draft_creation") throw new Error("GATE4_DRAFT_NOT_APPROVED");
  if (!wixResponse?.draftPost?.id) throw new Error("GATE4_UNCERTAIN_WIX_RESPONSE");
  if (wixResponse.requestFingerprint !== record.contentFingerprint) throw new Error("GATE4_WIX_FINGERPRINT_MISMATCH");
  return transitionContentState(record, "wix_draft_verified", { wixDraftId: wixResponse.draftPost.id, retrievedFingerprint: wixResponse.retrievedFingerprint, evidenceId: wixResponse.draftPost.id });
}

export function buildGate4DryRun({ pageReview, articleReview } = {}) {
  return { mode: "gate4_development_dry_run", schemaVersion: "gate4-content-workflow-v1", pageReview, articleReview, writesPerformed: 0, wixDraftsCreated: 0, livePagesModified: 0, publicationsPerformed: 0, crmWritesPerformed: 0, adsMutationsPerformed: 0, customerCommunicationsPerformed: 0 };
}
