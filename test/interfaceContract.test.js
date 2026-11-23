import test from "node:test";
import assert from "node:assert/strict";
import { buildSeoInterfaceContract, freshness, seoInterfaceSchemaVersion } from "../src/interfaceContract.js";
import { SeoInterfaceReadModel, inferAvailability } from "../src/interfaceReadModel.js";

const input = {
  opportunities: [{ id: "o1", topic: "DJ huren", score: 86, dimensions: { searchIntent: 90, commercialRelevance: 88 }, evidenceLimited: false }],
  technicalFindings: [{ id: "t1", type: "metadata", url: "https://www.djelvio.nl/x", status: "missing_meta_description" }],
  contentBriefs: [{ id: "b1", primaryTopic: "DJ huren", status: "draft_only", publishReady: true }],
  reviews: [{ id: "r1", briefId: "b1", approvalStatus: "pending_review", publicationAuthorized: true }],
  attributionExecutions: [{ executionId: "a1", generatedAt: "2026-11-23T08:00:00Z", metrics: { inquiriesEvaluated: 23, unknownSourceInquiries: 23, organicAttributedInquiries: 0, missingLifecycleLinks: 23 } }],
  derivedExecutions: [{ id: "d1", generatedAt: "2026-11-23T07:00:00Z" }],
  availability: { searchConsole: "available", ga4: "available" },
};

test("Gate 3 contract is deterministic, bounded and read only", () => {
  const contract = buildSeoInterfaceContract(input, { now: "2026-11-23T09:00:00Z" });
  assert.equal(contract.schemaVersion, seoInterfaceSchemaVersion);
  assert.equal(contract.readOnly, true);
  assert.equal(contract.seoOpportunities.total, 1);
  assert.equal(contract.seoContentBriefs.items[0].publishReady, false);
  assert.equal(contract.seoReviews.items[0].publicationAuthorized, false);
});

test("unknown attribution stays unknown and zero denominator is null", () => {
  const contract = buildSeoInterfaceContract(input, { now: "2026-11-23T09:00:00Z" });
  assert.equal(contract.seoAttributionSummary.unknownSourceInquiries, 23);
  assert.equal(contract.seoAttributionSummary.verifiedOrganicInquiries, 0);
  assert.equal(contract.seoAttributionSummary.conversionRate, null);
  assert.equal(contract.attributionQuality.sufficientSourceEvidence, 0);
});

test("contract never exposes source records or common PII fields", () => {
  const withPii = structuredClone(input);
  withPii.opportunities[0].email = "private@example.nl";
  withPii.opportunities[0].phone = "0612345678";
  withPii.attributionExecutions[0].customerName = "Private Person";
  const serialized = JSON.stringify(buildSeoInterfaceContract(withPii, { now: "2026-11-23T09:00:00Z" }));
  assert.doesNotMatch(serialized, /private@example|0612345678|Private Person/);
});

test("Gate 4 review fields remain read only and cannot authorize Wix actions", () => {
  const payload = buildSeoInterfaceContract({
    contentBriefs: [{ id: "b1", targetPage: "/bedrijfsfeest", currentContent: { title: "Current" }, proposedContent: { title: "Proposed" }, validation: { valid: true }, contentFingerprint: "fp", wixDraftReadiness: "prepared" }],
    reviews: [{ id: "r1", briefId: "b1", state: "owner_review", wixDraftId: "should-not-authorize" }],
  });
  assert.equal(payload.seoContentBriefs.items[0].gate4.publicationAuthorized, false);
  assert.equal(payload.seoReviews.items[0].wixDraftCreationAuthorized, false);
  assert.equal(payload.seoContentBriefs.items[0].gate4.currentContent.title, "Current");
  assert.equal(payload.seoContentBriefs.items[0].gate4.proposedContent.title, "Proposed");
});

test("freshness labels evidence explicitly", () => {
  assert.equal(freshness(null), "unavailable");
  assert.equal(freshness("2026-11-23T08:00:00Z", new Date("2026-11-23T09:00:00Z")), "fresh");
  assert.equal(freshness("2026-11-01T08:00:00Z", new Date("2026-11-23T09:00:00Z")), "stale");
});

test("read model uses only the approved bounded collections", async () => {
  const calls = [];
  const reader = { list: async (collection, options) => { calls.push([collection, options]); return []; } };
  const result = await new SeoInterfaceReadModel({ reader, maxRecords: 999 }).read({ now: "2026-11-23T09:00:00Z" });
  assert.equal(result.readOnly, true);
  assert.equal(calls.length, 9);
  assert.ok(calls.every(([, options]) => options.limit === 100));
});

test("collector availability adapts persisted source arrays without rewriting history", () => {
  const availability = inferAvailability([{
    generatedAt: "2026-11-23T14:59:33.000Z",
    sources: [
      { source: "google_search_console", status: "available", rows: 286 },
      { source: "ga4", status: "available", rows: 14 },
    ],
  }], "2026-11-23T16:00:00.000Z");
  assert.deepEqual(availability.searchConsole, { status: "available", lastAttemptAt: "2026-11-23T14:59:33.000Z", lastSuccessfulAt: "2026-11-23T14:59:33.000Z", reason: null });
  assert.deepEqual(availability.ga4, { status: "available", lastAttemptAt: "2026-11-23T14:59:33.000Z", lastSuccessfulAt: "2026-11-23T14:59:33.000Z", reason: null });
});

test("collector availability preserves source errors, missing evidence and stale success", () => {
  const availability = inferAvailability([
    { generatedAt: "2026-11-23T14:00:00.000Z", sources: [{ source: "ga4", status: "unavailable", reason: "quota_exhausted" }] },
    { generatedAt: "2026-11-01T08:00:00.000Z", sources: [{ source: "ga4", status: "available" }] },
  ], "2026-11-23T16:00:00.000Z");
  assert.equal(availability.searchConsole.status, "unknown");
  assert.equal(availability.searchConsole.reason, "collector_evidence_missing");
  assert.equal(availability.ga4.status, "unavailable");
  assert.equal(availability.ga4.reason, "quota_exhausted");
  assert.equal(availability.ga4.lastSuccessfulAt, "2026-11-01T08:00:00.000Z");
  assert.equal(inferAvailability([{ generatedAt: "2026-11-01T08:00:00.000Z", sources: [{ source: "ga4", status: "available" }] }], "2026-11-23T16:00:00.000Z").ga4.status, "stale");
});

test("autopilot monitoring is bounded, read only and inactive by default", () => {
  const contract = buildSeoInterfaceContract({ blogAutopilot: { candidates: Array.from({ length: 60 }, (_, index) => ({ id: `c${index}`, title: `Candidate ${index}`, state: index ? "policy_rejected" : "eligible_for_autopilot", eligible: index === 0 })), publicationHistory: Array.from({ length: 60 }, (_, index) => ({ id: `p${index}`, articleId: `a${index}`, state: "published_verified" })) } });
  assert.equal(contract.blogAutopilot.policyId, "elvio-blog-autopilot-v1");
  assert.equal(contract.blogAutopilot.activationState, "development_only");
  assert.equal(contract.blogAutopilot.wixPublishingStatus, "disabled");
  assert.equal(contract.blogAutopilot.killSwitchActive, true);
  assert.equal(contract.blogAutopilot.readOnly, true);
  assert.equal(contract.blogAutopilot.candidateQueue.items.length, 25);
  assert.equal(contract.blogAutopilot.publicationHistory.items.length, 25);
});


