import test from "node:test";
import assert from "node:assert/strict";
import { buildSeoBrief, evaluateOpportunity } from "../src/contentIntelligence.js";
import { validateContentDraft } from "../src/contentProduction.js";
import { buildArticleReview, buildExistingPageReview, buildGate4DryRun, chooseContentWorkflow, reconcileWixDraft, transitionContentState } from "../src/gate4Content.js";
import { gate4DryRunExample } from "../src/gate4Examples.js";
import { assertWixEndpointAllowed, buildWixDraftPayload, draftMappingRecord, htmlToWixRichContent, wixPhase2Contract } from "../src/wixDrafts.js";

const supportedOpportunity = (overrides = {}) => evaluateOpportunity({ topic: "Internationale bruiloft muziek", commercialRelevance: 80, searchIntent: 75, evidenceStrength: 75, serviceFit: 90, conversionRelevance: 80, coverageGap: 80, competitionFeasibility: 60, implementationEase: 60, duplicationSafety: 80, ...overrides });

test("Gate 4 selects an existing-page workflow before proposing an article", () => {
  assert.equal(chooseContentWorkflow(supportedOpportunity({ existingPage: "/bruiloftsfeest" })).workflow, "existing_page_optimization");
  assert.equal(chooseContentWorkflow(supportedOpportunity({ evidenceStrength: 20 })).workflow, "research_required");
  assert.equal(chooseContentWorkflow(supportedOpportunity()).workflow, "new_article");
});

test("existing-page proposal is side-by-side, immutable and cannot write the page", () => {
  const opportunity = supportedOpportunity({ existingPage: "/bedrijfsfeest" });
  const review = buildExistingPageReview({ opportunity, currentPage: { url: "https://www.djelvio.nl/bedrijfsfeest", content: { title: "Current" } }, proposed: { searchIntent: "commercial", commercialObjective: "qualified inquiries", content: { title: "Proposed" }, metadata: {}, cta: "Vraag offerte aan", explanation: "clearer" }, evidence: ["gsc"] });
  assert.equal(review.currentContent.title, "Current");
  assert.equal(review.proposedContent.title, "Proposed");
  assert.equal(review.livePageWriteAllowed, false);
  assert.equal(review.publicationAuthorized, false);
});

test("new article requires evidence and rejects duplicate titles or slugs", () => {
  const opportunity = supportedOpportunity();
  const brief = buildSeoBrief(opportunity, { sourceEvidence: ["verified"], proposedTitle: "Internationale bruiloft muziek" });
  assert.throws(() => buildArticleReview({ opportunity, brief, existingContent: [{ id: "x", title: "Internationale bruiloft muziek", slug: "different" }] }), /(similar_existing_page|duplicate_content)/);
  assert.throws(() => buildArticleReview({ opportunity: supportedOpportunity({ evidenceStrength: 20 }), brief }), /insufficient_evidence/);
});

test("content validation blocks unsupported claims, unsafe HTML, prices and unsafe links", () => {
  const base = { title: "x", slug: "x", metaDescription: "x", h1: "x", bodyHtml: "<p>Veilige tekst</p>", cta: "Vraag offerte aan", sourceEvidence: ["verified"], approvalStatus: "pending_review", internalLinks: ["/contact"] };
  assert.equal(validateContentDraft(base).valid, true);
  assert.ok(validateContentDraft({ ...base, bodyHtml: "<script>x</script>" }).errors.includes("unsafe_html"));
  assert.ok(validateContentDraft({ ...base, bodyHtml: "<p>Altijd beschikbaar</p>" }).errors.includes("unsupported_claim"));
  assert.ok(validateContentDraft({ ...base, bodyHtml: "<p>€ 900</p>", authoritativePricingEvidence: null }).errors.includes("unverified_price_claim"));
  assert.ok(validateContentDraft({ ...base, internalLinks: ["https://evil.example/"] }).errors.includes("unsafe_internal_link"));
});

test("Wix v3 payload preserves rich-content structure and forces publish false", () => {
  const draft = { title: "Titel", slug: "titel", metaDescription: "Beschrijving", bodyHtml: "<h1>Titel</h1><p>Tekst</p>", validation: { valid: true } };
  const payload = buildWixDraftPayload(draft);
  assert.equal(payload.payload.publish, false);
  assert.deepEqual(payload.payload.fieldsets, ["RICH_CONTENT", "URL"]);
  assert.deepEqual(payload.payload.draftPost.richContent.nodes.map((node) => node.type), ["HEADING", "PARAGRAPH"]);
  assert.equal(wixPhase2Contract.publishEndpointAllowed, false);
  assert.equal(payload.publishAllowed, false);
  assert.equal(payload.writesPerformed, 0);
});

test("Wix endpoint allowlist excludes update, publish, delete and arbitrary endpoints", () => {
  assert.equal(assertWixEndpointAllowed("https://www.wixapis.com/blog/v3/draft-posts"), true);
  for (const url of ["https://www.wixapis.com/blog/v3/draft-posts/id", "https://www.wixapis.com/blog/v3/draft-posts/id/publish", "https://evil.example/blog/v3/draft-posts"]) assert.throws(() => assertWixEndpointAllowed(url), /NOT_ALLOWED/);
});

test("approval state is fingerprint-bound and content changes require fresh approval", () => {
  const record = { state: "owner_review", contentFingerprint: "abc", validation: { valid: true }, audit: [] };
  assert.throws(() => transitionContentState(record, "approved_for_draft_creation", { approvedFingerprint: "old" }), /FINGERPRINT/);
  const approved = transitionContentState(record, "approved_for_draft_creation", { approvedFingerprint: "abc", at: "2026-11-23T18:00:00Z" });
  assert.equal(approved.state, "approved_for_draft_creation");
  assert.equal(approved.audit.length, 1);
});

test("uncertain Wix responses never retry blindly and exact retrieval is required", () => {
  const approved = { state: "approved_for_draft_creation", contentFingerprint: "abc", audit: [] };
  assert.throws(() => reconcileWixDraft(approved, {}), /UNCERTAIN/);
  assert.throws(() => reconcileWixDraft(approved, { draftPost: { id: "wix-1" }, requestFingerprint: "abc", retrievedFingerprint: "different" }), /RECONCILIATION/);
  const verified = reconcileWixDraft(approved, { draftPost: { id: "wix-1" }, requestFingerprint: "abc", retrievedFingerprint: "abc" });
  assert.equal(verified.state, "wix_draft_verified");
});

test("draft mappings use internal fingerprints and never pretend to assign Wix IDs", () => {
  const prepared = draftMappingRecord({ contentFingerprint: "abc" });
  assert.equal(prepared.wixDraftId, null);
  assert.match(prepared.id, /^wix-draft-mapping:/);
  assert.equal(prepared.publicationAuthorized, false);
});

test("Gate 4 dry run provides both workflows and zero external mutations", () => {
  const result = gate4DryRunExample();
  assert.equal(result.pageReview.kind, "existing_page_optimization");
  assert.equal(result.articleReview.kind, "new_article");
  assert.equal(result.articleReview.wixDryRun.payload.publish, false);
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.wixDraftsCreated, 0);
  assert.equal(result.livePagesModified, 0);
  assert.equal(result.publicationsPerformed, 0);
  assert.equal(result.crmWritesPerformed, 0);
  assert.equal(result.adsMutationsPerformed, 0);
  assert.equal(result.customerCommunicationsPerformed, 0);
});

test("rich content rejects empty or unsupported HTML", () => assert.throws(() => htmlToWixRichContent("<div>x</div>"), /EMPTY/));
