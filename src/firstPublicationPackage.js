import { sha256, stableId } from "./identity.js";
import { gate4DryRunExample } from "./gate4Examples.js";
import { loadBundledCreativeStudioRegistry } from "./creativeStudioProduction.js";
import { classifyOpportunityEvidence, opportunityEvidenceCategories } from "./opportunityEvidence.js";

export const firstPublicationSite = Object.freeze({
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
  writerMemberId: "ed017bc0-3db1-467e-9f2a-a345b6720e26",
  baseUrl: "https://www.djelvio.nl",
});

export function buildFirstPublicationPackage({ records = loadBundledCreativeStudioRegistry(), preparedAt = "2026-11-23T22:00:00.000Z" } = {}) {
  const articleReview = gate4DryRunExample().articleReview;
  const article = articleReview.draft;
  const image = records.find((item) => item.assetId === "pexels-34307990-v1");
  if (!image) throw new Error("FIRST_PUBLICATION_IMAGE_MISSING");
  const opportunity = {
    id: "exploratory-international-wedding-music-v1",
    topic: article.title,
    evidenceCategory: opportunityEvidenceCategories.exploratory,
    evidenceStrength: "exploratory",
    evidenceFactors: [
      { type: "related_first_party_search", ref: "gsc:2026-10-25..2026-11-22:all-in-trouwfeest-dj-pakket:13-impressions" },
      { type: "commercial_search_intent", ref: "service-page:/bruiloftsfeest" },
      { type: "site_content_gap", ref: "site-audit:no-dedicated-international-wedding-music-guide" },
      { type: "distinct_editorial_value", ref: "editorial:multilingual-multigenerational-music-planning" },
      { type: "verified_service_connection", ref: "verified-business-fact:musical-versatility-and-wedding-service" },
    ],
    limitation: "No direct first-party query proves established demand for this exact topic; it remains explicitly exploratory.",
  };
  const evidenceDecision = classifyOpportunityEvidence(opportunity);
  if (!evidenceDecision.sufficient) throw new Error("FIRST_PUBLICATION_EVIDENCE_INSUFFICIENT");
  const seo = {
    title: "Muziek voor een internationale bruiloft | DJ Elvio",
    metaDescription: article.metaDescription,
    slug: article.slug,
    canonicalUrl: `${firstPublicationSite.baseUrl}/post/${article.slug}`,
  };
  const contentFingerprint = sha256({
    language: article.language, title: article.title, h1: article.h1, h2s: article.h2s,
    bodyHtml: article.bodyHtml, internalLinks: article.internalLinks, cta: article.cta, seo,
  });
  const publicationFingerprint = sha256({
    contentFingerprint,
    assetId: image.assetId,
    imageChecksum: image.checksum,
    siteId: firstPublicationSite.siteId,
    writerMemberId: firstPublicationSite.writerMemberId,
    canonicalUrl: seo.canonicalUrl,
  });
  return {
    schemaVersion: "first-publication-owner-approval-v1",
    packageId: stableId("first-publication-package", { contentFingerprint, publicationFingerprint }),
    preparedAt,
    selection: {
      selectedOpportunity: opportunity,
      evidenceDecision,
      classification: "evidence_backed_exploratory_opportunity",
      rationale: "All higher-scoring established opportunities currently point to existing commercial or informational pages and should be handled as page-improvement recommendations. This is the strongest distinct new-article candidate that passes the exploratory evidence bundle without competing with a stronger existing target.",
    },
    article: {
      ...article,
      seoTitle: seo.title,
      metaDescription: seo.metaDescription,
      expectedPublicUrl: seo.canonicalUrl,
      contentFingerprint,
    },
    image: {
      assetId: image.assetId,
      driveFileId: image.driveFileId,
      fileName: image.fileName,
      checksum: image.checksum,
      provenance: image.provenance,
      altText: image.altText,
      illustrativeStock: true,
      actualDjElvioEvent: false,
    },
    wix: {
      siteId: firstPublicationSite.siteId,
      writerMemberId: firstPublicationSite.writerMemberId,
      existingHistoricalDraftId: "cf13a806-22ee-43c2-bb29-c362132bf325",
      intendedOperationAfterApproval: "upload_selected_image_then_update_existing_unpublished_draft_then_retrieve_and_verify_then_publish",
      duplicateDraftCreationAllowed: false,
      imageUploadAuthorized: false,
      draftModificationAuthorized: false,
      publicationAuthorized: false,
    },
    publicationFingerprint,
    finalEligibility: "owner_approval_required_for_controlled_wix_trial",
    killSwitchRequiredUntilExecution: true,
  };
}
