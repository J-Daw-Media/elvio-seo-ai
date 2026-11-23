import test from "node:test";
import assert from "node:assert/strict";
import { buildSeoInterfaceContract, freshness, seoInterfaceSchemaVersion } from "../src/interfaceContract.js";
import { SeoInterfaceReadModel } from "../src/interfaceReadModel.js";

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


