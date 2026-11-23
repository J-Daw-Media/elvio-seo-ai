import test from "node:test";
import assert from "node:assert/strict";
import { acquisitionEvidence, attributionCandidate, appendLifecycle, reconcileAttribution, aggregateCommercialMetrics } from "../src/attribution.js";
import { classifyIndexingFinding, structuredDataDiagnosis, headingDiagnosis, overlapAssessment } from "../src/technicalRemediation.js";
import { evaluateOpportunity, initialPhase2Opportunities, buildSeoBrief, opportunityWeights } from "../src/contentIntelligence.js";
import { prepareDutchDraft, validateContentDraft, detectDuplicateContent, safeSlug } from "../src/contentProduction.js";
import { validateCreativeAsset, recommendAssets } from "../src/creativeStudio.js";
import { createReviewPackage, decideReview, approvalMatches, invalidateOnChange } from "../src/review.js";
import { buildWixDraftPayload, assertWixWriteProhibited, wixPhase2Contract } from "../src/wixDrafts.js";
import { runPhase2Preparation } from "../src/phase2.js";
import { prepareDerivedRecords, persistDerivedRecords, derivedCollections } from "../src/derivedMemory.js";
import { InMemorySeoStore } from "../src/memory.js";
import { prepareAttributionActivation, persistAttributionActivation, attributionCollections, ApprovedAttributionReadClient } from "../src/attributionActivation.js";

test("unknown acquisition remains unknown and is never inferred organic", () => {
  assert.deepEqual(acquisitionEvidence({}), { state: "unavailable", channel: "unknown", landingPage: null, referrer: null, utm: { source: null, medium: null, campaign: null, content: null, term: null }, clickIdHashes: {}, conflict: false, limitation: "Do not classify as organic without reliable source evidence." });
});

test("organic source evidence is verified without individual Search Console queries", () => {
  const evidence = acquisitionEvidence({ landingPageUrl: "https://www.djelvio.nl/bruiloftsfeest", referrer: "https://www.google.com/search?q=dj", utm_source: "google", utm_medium: "organic" });
  assert.equal(evidence.state, "verified");
  assert.equal(evidence.channel, "organic_search");
  assert.equal(JSON.stringify(evidence).includes("q=dj"), false);
  assert.equal("searchQuery" in evidence, false);
});

test("attribution candidates use stable submission identity and hash analytics IDs", () => {
  const a = attributionCandidate({ submissionId: "wix-1", analyticsId: "private-id", landingPageUrl: "/bedrijfsfeest" });
  const b = attributionCandidate({ submissionId: "wix-1", analyticsId: "private-id", landingPageUrl: "/bedrijfsfeest" });
  assert.equal(a.id, b.id); assert.notEqual(a.analyticsIdHash, "private-id"); assert.equal(a.productionWriteAllowed, false);
});

test("paid identifiers override organic-looking referrers and are stored only as hashes", () => {
  const evidence = acquisitionEvidence({ referrer: "https://www.google.com/search?q=dj", gclid: "private-click-id" });
  assert.equal(evidence.channel, "conflicting_paid_and_organic_evidence");
  assert.equal(evidence.conflict, true);
  assert.notEqual(evidence.clickIdHashes.gclid, "private-click-id");
  assert.equal(JSON.stringify(evidence).includes("private-click-id"), false);
});

test("distinct inquiries remain distinct and duplicate lifecycle events collapse", () => {
  let a = attributionCandidate({ submissionId: "wix-1" });
  const b = attributionCandidate({ submissionId: "wix-2" });
  a = appendLifecycle(a, { stage: "confirmed_booking", externalId: "booking-1", confirmed: true });
  a = appendLifecycle(a, { stage: "confirmed_booking", externalId: "booking-1", confirmed: true });
  assert.notEqual(a.id, b.id); assert.equal(a.lifecycle.length, 1);
});

test("reconciliation reports conflicting evidence without overwriting", () => {
  const a = attributionCandidate({ submissionId: "wix-1", utm_source: "google", utm_medium: "organic" });
  const b = attributionCandidate({ submissionId: "wix-1", gclid: "paid-click" });
  const result = reconcileAttribution([a, b]);
  assert.equal(result.candidates.length, 1); assert.equal(result.conflicts.length, 1); assert.equal(result.writesPerformed, 0);
});

test("commercial metrics require explicit confirmed booking and revenue evidence", () => {
  let item = attributionCandidate({ submissionId: "wix-1", utm_source: "google", utm_medium: "organic" });
  item = appendLifecycle(item, { stage: "qualified_lead", externalId: "lead-1", confirmed: true });
  item = appendLifecycle(item, { stage: "confirmed_booking", externalId: "booking-1", confirmed: true });
  item = appendLifecycle(item, { stage: "revenue", externalId: "invoice-1", confirmed: true, amount: 650 });
  assert.deepEqual(aggregateCommercialMetrics([item]), { inquiries: 1, qualifiedInquiries: 1, confirmedBookings: 1, attributableRevenue: 650, unknownSourceInquiries: 0, inquiryToBookingRate: 1 });
});

test("technical findings never authorize automatic website changes", () => {
  const finding = classifyIndexingFinding({ url: "https://www.djelvio.nl/x", reason: "Excluded by noindex", source: "gsc" });
  assert.equal(finding.automaticChangeAllowed, false);
  assert.equal(structuredDataDiagnosis({ url: "x", jsonLdTypes: ["Event"], hasActualScheduledEvent: false })[0].ownerApprovalRequired, true);
  assert.equal(headingDiagnosis({ url: "x", h1s: [] }).status, "missing_h1");
});

test("overlap assessment is deterministic and never auto-consolidates", () => {
  const result = overlapAssessment({ url: "/a", title: "DJ prijzen en pakketten", description: "Wat kost een DJ pakket" }, { url: "/b", title: "Wat kost een DJ", description: "DJ prijzen en pakketten" });
  assert.equal(result.automaticConsolidationAllowed, false); assert.ok(result.similarity > 0);
});

test("opportunity weights are transparent and sum to one", () => {
  assert.equal(Math.round(Object.values(opportunityWeights).reduce((a, b) => a + b, 0) * 100), 100);
  const item = evaluateOpportunity({ topic: "x", evidenceStrength: 20, commercialRelevance: 90 });
  assert.equal(item.evidenceLimited, true); assert.equal(item.predictedRevenue, null); assert.equal(item.publishReady, false);
});

test("initial opportunities prefer existing pages and keep weak private-party demand provisional", () => {
  const rows = initialPhase2Opportunities();
  assert.equal(rows.length, 7);
  assert.equal(rows.find((row) => row.eventCategory === "private").recommendedAction, "research_before_content");
  assert.equal(rows.find((row) => row.eventCategory === "pricing").recommendedAction, "optimize_existing_page");
});

test("briefs contain evidence, overlap and approval boundaries", () => {
  const opportunity = initialPhase2Opportunities()[0];
  const brief = buildSeoBrief(opportunity, { sourceEvidence: ["gsc:first-party"], supportingQueries: ["dj huren amsterdam"] });
  assert.equal(brief.publishReady, false); assert.equal(brief.sourceEvidence.length, 1); assert.match(brief.callToAction, /offerte/i);
});

test("Dutch drafts are safe, factual, structured and draft-only", () => {
  const opportunity = initialPhase2Opportunities().find((row) => !row.evidenceLimited);
  const draft = prepareDutchDraft(buildSeoBrief(opportunity, { sourceEvidence: ["gsc:first-party"] }));
  assert.equal(draft.validation.valid, true); assert.equal(draft.publishReady, false); assert.match(draft.bodyHtml, /meer dan 20 jaar ervaring als DJ/);
  assert.equal(validateContentDraft({ ...draft, bodyHtml: "<script>alert(1)</script>" }).valid, false);
});

test("slug and duplicate checks are deterministic", () => {
  assert.equal(safeSlug("DJ Prijzen & Pakketten!"), "dj-prijzen-pakketten");
  assert.equal(detectDuplicateContent({ title: "DJ Prijzen", slug: "dj-prijzen" }, [{ id: "x", title: "DJ Prijzen", slug: "ander" }])[0].reason, "duplicate_title");
});

test("Creative Studio candidates require rights and provenance", () => {
  assert.equal(validateCreativeAsset({ assetId: "x", url: "drive://x", rightsStatus: "owned", provenance: "DJ archive" }).valid, true);
  assert.equal(validateCreativeAsset({ assetId: "x", url: "drive://x", rightsStatus: "unknown" }).valid, false);
  const results = recommendAssets({ assets: [{ assetId: "x", url: "drive://x", rightsStatus: "owned", provenance: "DJ archive", categories: ["wedding"] }], eventCategory: "wedding", brief: { id: "b" } });
  assert.equal(results[0].uploadAllowed, false);
});

test("review approval is immutable and invalidates after content changes", () => {
  const draft = { title: "x" }; const item = createReviewPackage({ draft, brief: { commercialObjective: "bookings", cannibalizationAssessment: "low" } });
  const approved = decideReview(item, { decision: "approve", reviewerId: "owner" });
  assert.equal(approvalMatches(approved, draft), true);
  assert.equal(invalidateOnChange(approved, { title: "changed" }).approvalStatus, "pending_review");
});

test("Wix payload generation is dry-run and all writes remain prohibited", () => {
  const brief = buildSeoBrief(initialPhase2Opportunities()[0], { sourceEvidence: ["gsc:first-party"] });
  const draft = prepareDutchDraft(brief); const payload = buildWixDraftPayload(draft);
  assert.equal(payload.writesPerformed, 0); assert.equal(payload.publishAllowed, false); assert.equal(wixPhase2Contract.draftWritesEnabled, false);
  assert.throws(assertWixWriteProhibited, /NOT_AUTHORIZED/);
});

test("Phase 2 preparation produces review packages without external mutations", () => {
  const evidence = Object.fromEntries(initialPhase2Opportunities().map((item) => [item.id, { sourceEvidence: ["phase1b-baseline"] }]));
  const result = runPhase2Preparation({ evidence });
  assert.equal(result.opportunities.length, 7); assert.ok(result.drafts.length >= 1); assert.equal(result.writesPerformed, 0); assert.equal(result.externalMutationsPerformed, 0); assert.equal(result.productionActivationEnabled, false);
});

test("derived memory is versioned, bounded and replay safe", async () => {
  const technicalAudit = { pages: [{ url: "https://www.djelvio.nl/fotovideo", h1s: [], issues: ["missing_h1"], jsonLdTypes: ["Event"], canonical: "https://www.djelvio.nl/fotovideo" }] };
  const derived = prepareDerivedRecords({ measurementPeriod: { startDate: "2026-10-25", endDate: "2026-11-22" }, sources: [{ source: "gsc", status: "available", rows: 286 }], technicalAudit });
  assert.equal(derived.opportunities.length, 7);
  assert.ok(derived.technicalFindings.length >= 2);
  assert.equal(derived.reviews.every((item) => item.publicationAuthorized === false), true);
  const store = new InMemorySeoStore();
  const first = await persistDerivedRecords(store, derived, { generatedAt: "2026-11-23T12:00:00Z" });
  const replay = await persistDerivedRecords(store, derived, { generatedAt: "2026-11-23T12:05:00Z" });
  assert.ok(first.writesPerformed > 0);
  assert.equal(replay.writesPerformed, 0);
  assert.equal((await store.list(derivedCollections.executions)).length, 1);
});

test("changed source evidence creates a new derived version without overwrite", async () => {
  const store = new InMemorySeoStore();
  const a = prepareDerivedRecords({ measurementPeriod: { startDate: "2026-10-25", endDate: "2026-11-22" }, sources: [{ source: "gsc", rows: 10 }] });
  const b = prepareDerivedRecords({ measurementPeriod: { startDate: "2026-10-25", endDate: "2026-11-22" }, sources: [{ source: "gsc", rows: 11 }] });
  await persistDerivedRecords(store, a);
  await persistDerivedRecords(store, b);
  assert.equal((await store.list(derivedCollections.executions)).length, 2);
  assert.notEqual(a.sourceFingerprint, b.sourceFingerprint);
});

test("Gate 2 attribution preparation is bounded, privacy safe and preserves unknown sources", async () => {
  const sources = {
    leadAttribution: [
      { submissionId: "wix-1", receivedAt: "2026-11-01T10:00:00Z", acquisitionSource: "unknown", outcome: { status: "offer_sent", quotationReference: "OFF-1" } },
      { submissionId: "wix-2", receivedAt: "2026-11-02T10:00:00Z", utm: { source: "google", medium: "organic" }, landingPageUrl: "https://www.djelvio.nl/bruiloftsfeest?email=private@example.com" },
      { submissionId: "synthetic", synthetic: true },
    ],
    wixOfferDeliveries: [{ submissionId: "wix-1", status: "client_offer_sent", quotationReference: "OFF-1" }],
    quotationReferences: [{ submissionId: "wix-1", quotationReference: "OFF-1" }],
    automatedBookingConfirmations: [], bookingAcquisitionLinks: [], attributedBookingRevenue: [],
  };
  const prepared = prepareAttributionActivation(sources, { generatedAt: "2026-11-23T16:00:00Z" });
  assert.equal(prepared.candidates.length, 2);
  assert.equal(prepared.metrics.unknownSourceInquiries, 1);
  assert.equal(prepared.metrics.organicAttributedInquiries, 1);
  assert.equal(JSON.stringify(prepared).includes("private@example.com"), false);
  assert.equal(prepared.candidates[0].candidate.productionWriteAllowed, false);
});

test("Gate 2 does not duplicate a read-model record when submission and acquisition IDs match", () => {
  const prepared = prepareAttributionActivation({
    leadAttribution: [{ submissionId: "wix-1", acquisitionId: "wix-1", outcome: { status: "offer_sent", quotationReference: "OFF-1" } }],
    wixOfferDeliveries: [{ submissionId: "wix-1", acquisitionId: "wix-1", status: "client_offer_sent", quotationReference: "OFF-1" }],
    quotationReferences: [{ submissionId: "wix-1", acquisitionId: "wix-1", quotationReference: "OFF-1" }],
    automatedBookingConfirmations: [], bookingAcquisitionLinks: [], attributedBookingRevenue: [],
  });
  assert.equal(prepared.conflicts.length, 0);
  assert.equal(prepared.candidates[0].candidate.lifecycle.filter((event) => event.stage === "quotation").length, 1);
});

test("Gate 2 candidate persistence is create-only and deterministic on replay", async () => {
  const prepared = prepareAttributionActivation({
    leadAttribution: [{ submissionId: "wix-1", receivedAt: "2026-11-01T10:00:00Z" }],
    wixOfferDeliveries: [], quotationReferences: [], automatedBookingConfirmations: [], bookingAcquisitionLinks: [], attributedBookingRevenue: [],
  }, { generatedAt: "2026-11-23T16:00:00Z" });
  const store = new InMemorySeoStore();
  const first = await persistAttributionActivation(store, prepared, { generatedAt: "2026-11-23T16:00:00Z" });
  const replay = await persistAttributionActivation(store, prepared, { generatedAt: "2026-11-23T16:01:00Z" });
  assert.equal(first.writesPerformed, 2);
  assert.equal(replay.writesPerformed, 0);
  assert.equal((await store.list(attributionCollections.candidates)).length, 1);
});

test("Gate 2 production reader rejects every non-approved collection", async () => {
  const client = new ApprovedAttributionReadClient({ projectId: "p", accessToken: "t", fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  await assert.rejects(() => client.list("secretaryAudit"), /NOT_APPROVED/);
});
