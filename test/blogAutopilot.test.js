import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { blogAutopilotPolicyV1, evaluatePublicationWindow, publicationSlotAt } from "../src/blogAutopilotPolicy.js";
import { autopilotRequiredChecks, evaluateAutopilotEligibility } from "../src/blogEligibility.js";
import { createPublicationRecord, transitionPublication } from "../src/blogPublicationState.js";
import { assertPublicationEndpointAllowed, buildPublicationPlan, publicationExecutorContract } from "../src/blogPublicationExecutor.js";
import { FirestorePublicationLedger, reservePublicationSlot } from "../src/blogPublicationLedger.js";
import { selectAutopilotTopics } from "../src/blogTopicSelection.js";
import { selectAutopilotAsset } from "../src/creativeStudio.js";
import { gate4DryRunExample } from "../src/gate4Examples.js";
import { normalizeWixDraft, verifyRetrievedDraft } from "../src/wixOneShotExecutor.js";

const fingerprint = "b".repeat(64);
function candidate(overrides = {}) {
  return {
    id: "candidate-1", stableArticleId: "article-1", contentFingerprint: fingerprint, contentCategory: "wedding",
    evidenceEvaluatedAt: "2026-11-20T10:00:00.000Z", opportunityEvidenceStrength: "sufficient", topicSelectedToFillSchedule: false,
    requiredCommercialChanges: [], image: { eligible: true, assetId: "asset-1" },
    checks: Object.fromEntries(autopilotRequiredChecks.map((key) => [key, true])), ...overrides,
  };
}

test("autopilot policy is versioned, capped at six and inactive by default", () => {
  assert.equal(blogAutopilotPolicyV1.id, "elvio-blog-autopilot-v1");
  assert.equal(blogAutopilotPolicyV1.monthlyPublicationLimit, 6);
  assert.equal(blogAutopilotPolicyV1.slots.length, 6);
  assert.equal(blogAutopilotPolicyV1.activationState, "development_only");
  assert.equal(publicationExecutorContract.productionRequestEnabled, false);
});

test("topic selection ranks supported opportunities and never fabricates quota fillers", () => {
  const base = { evidenceStrength: "sufficient", searchIntent: "informational_commercial", commercialObjective: "qualified_inquiries", cannibalizationRisk: "low", evaluatedAt: "2026-11-20T10:00:00Z" };
  const result = selectAutopilotTopics({ now: new Date("2026-11-23T10:00:00Z"), opportunities: [
    { ...base, id: "a", topic: "Bruiloftsmuziek", opportunityScore: 90 },
    { ...base, id: "b", topic: "Bedrijfsfeest muziek", opportunityScore: 80 },
    { ...base, id: "c", topic: "Zwak onderwerp", opportunityScore: 99, evidenceStrength: "limited" },
  ] });
  assert.deepEqual(result.selected.map((item) => item.id), ["a", "b"]); assert.equal(result.rejected[0].id, "c"); assert.equal(result.unfilledCapacity, 4);
  const empty = selectAutopilotTopics({ now: new Date("2026-11-23T10:00:00Z"), opportunities: [] }); assert.equal(empty.selected.length, 0); assert.equal(empty.unfilledCapacity, 6);
});

test("topic selection rejects published duplicates, cannibalization and better existing-page targets", () => {
  const base = { evidenceStrength: "sufficient", searchIntent: "commercial", commercialObjective: "inquiries", cannibalizationRisk: "low", evaluatedAt: "2026-11-20T10:00:00Z" };
  const result = selectAutopilotTopics({ now: new Date("2026-11-23T10:00:00Z"), publishedTopics: ["Reeds gepubliceerd"], opportunities: [
    { ...base, id: "d", topic: "Reeds gepubliceerd" },
    { ...base, id: "e", topic: "Overlap", cannibalizationRisk: "high" },
    { ...base, id: "f", topic: "Landingspagina", existingPageBetterTarget: true },
  ] });
  assert.equal(result.selected.length, 0); assert.equal(result.rejected.length, 3);
});

test("six fixed day slots use Amsterdam local time across DST", () => {
  assert.deepEqual(blogAutopilotPolicyV1.slots.map((slot) => slot.dayOfMonth), [3, 8, 13, 18, 23, 28]);
  assert.equal(publicationSlotAt("2026-03-28T09:05:00.000Z")?.key, "2026-03:day-28");
  assert.equal(publicationSlotAt("2026-10-23T08:05:00.000Z")?.key, "2026-10:day-23");
  assert.equal(publicationSlotAt("2026-10-28T09:05:00.000Z")?.key, "2026-10:day-28");
});

test("all six November slots resolve exactly at 10:00 Amsterdam", () => {
  for (const day of [3, 8, 13, 18, 23, 28]) {
    const key = publicationSlotAt(`2026-11-${String(day).padStart(2, "0")}T09:05:00.000Z`)?.key;
    assert.equal(key, `2026-11:day-${String(day).padStart(2, "0")}`);
  }
});

test("missed, delayed and non-slot runs cannot catch up", () => {
  for (const instant of ["2026-11-03T10:00:00.000Z", "2026-11-03T09:45:00.000Z", "2026-11-04T09:00:00.000Z"]) {
    assert.equal(evaluatePublicationWindow({ instant, killSwitch: false }).allowed, false);
  }
});

test("kill switch, monthly quota and consumed slots fail closed", () => {
  const instant = "2026-11-03T09:05:00.000Z";
  assert.equal(evaluatePublicationWindow({ instant, killSwitch: true }).reason, "kill_switch_active");
  const month = Array.from({ length: 6 }, (_, index) => ({ monthKey: "2026-11", state: index === 5 ? "uncertain" : "published_verified" }));
  assert.equal(evaluatePublicationWindow({ instant, killSwitch: false, monthlyRecords: month }).reason, "monthly_limit_reached");
  assert.equal(evaluatePublicationWindow({ instant, killSwitch: false, slotRecords: [{ slotKey: "2026-11:day-03", state: "publication_started" }] }).reason, "slot_already_consumed");
});

test("six consumed attempts allow no seventh attempt", () => {
  const records = Array.from({ length: 6 }, (_, index) => ({ monthKey: "2026-11", state: index % 2 ? "uncertain" : "published_verified" }));
  const result = evaluatePublicationWindow({ instant: "2026-11-28T09:05:00.000Z", killSwitch: false, monthlyRecords: records });
  assert.equal(result.allowed, false); assert.equal(result.reason, "monthly_limit_reached"); assert.equal(result.monthCount, 6);
});

test("calendar-month quota resets without releasing uncertain prior-month attempts", () => {
  const old = [{ monthKey: "2026-10", state: "uncertain" }, { monthKey: "2026-10", state: "published_verified" }];
  assert.equal(evaluatePublicationWindow({ instant: "2026-11-03T09:05:00.000Z", killSwitch: false, monthlyRecords: old }).allowed, true);
});

test("complete evidence is eligible but never directly authorizes publication", () => {
  const result = evaluateAutopilotEligibility(candidate(), { now: new Date("2026-11-23T10:00:00.000Z"), killSwitch: false });
  assert.equal(result.eligible, true); assert.equal(result.decision, "eligible_for_autopilot"); assert.equal(result.publicationAuthorized, false);
});

test("stale or weak evidence, duplicate topics and cannibalization are rejected", () => {
  for (const mutate of [
    { evidenceEvaluatedAt: "2026-01-01T00:00:00Z" },
    { opportunityEvidenceStrength: "limited" },
    { topicSelectedToFillSchedule: true },
    { checks: { ...candidate().checks, duplicateCheckPassed: false } },
    { checks: { ...candidate().checks, cannibalizationCheckPassed: false } },
    { checks: { ...candidate().checks, existingPageNotBetterTarget: false } },
  ]) assert.equal(evaluateAutopilotEligibility(candidate(mutate), { now: new Date("2026-11-23T10:00:00Z"), killSwitch: false }).eligible, false);
});

test("unsupported claims, pricing changes, invalid links and missing images fail closed", () => {
  const cases = [
    candidate({ checks: { ...candidate().checks, unsupportedClaimsAbsent: false } }),
    candidate({ requiredCommercialChanges: ["pricing"] }),
    candidate({ checks: { ...candidate().checks, internalLinksValid: false } }),
    candidate({ image: { eligible: false } }),
    candidate({ image: { eligible: true, fabricatedEventPhotography: true } }),
  ];
  const decisions = cases.map((item) => evaluateAutopilotEligibility(item, { now: new Date("2026-11-23T10:00:00Z"), killSwitch: false }));
  assert.ok(decisions.every((item) => !item.eligible && item.ownerNotificationRequired));
  assert.equal(decisions[1].decision, "held_for_review");
});

test("Creative Studio chooses rights-cleared relevant low-reuse imagery only", () => {
  const result = selectAutopilotAsset({ eventCategory: "wedding", brief: { id: "brief-1" }, priorUsage: [{ assetId: "used", count: 2 }], assets: [
    { assetId: "used", url: "https://assets.example/used.jpg", rightsStatus: "owned", provenance: "drive:1", categories: ["wedding"], altText: "Bruiloftsfeest met DJ Elvio" },
    { assetId: "bad", url: "https://third.example/no-rights.jpg", rightsStatus: "unknown", provenance: "web", categories: ["wedding"], altText: "Niet toegestaan" },
    { assetId: "chosen", url: "https://assets.example/chosen.webp", rightsStatus: "owner_approved", provenance: "drive:2", categories: ["wedding"], altText: "Dansvloer tijdens een bruiloft met DJ Elvio" },
  ] });
  assert.equal(result.eligible, true); assert.equal(result.selected.assetId, "chosen");
});

test("missing or incompatible Creative Studio imagery holds the article", () => {
  assert.equal(selectAutopilotAsset({ assets: [{ assetId: "x", url: "https://assets.example/file.gif", rightsStatus: "owned", provenance: "drive", categories: ["wedding"], altText: "Goede beschrijving" }], eventCategory: "wedding" }).eligible, false);
});

test("publication state keeps draft and publication eligibility separate", () => {
  let record = createPublicationRecord({ articleId: "article-1", contentFingerprint: fingerprint });
  record = transitionPublication(record, "research_verified");
  record = transitionPublication(record, "article_generated");
  record = transitionPublication(record, "content_validated");
  const decision = { eligible: true, policyId: blogAutopilotPolicyV1.id };
  record = transitionPublication(record, "eligible_for_autopilot", { policyDecision: decision });
  record = transitionPublication(record, "wix_draft_creation_reserved");
  record = transitionPublication(record, "wix_draft_verified", { wixDraftId: "draft-1", retrievedFingerprint: fingerprint });
  assert.equal(record.state, "wix_draft_verified"); assert.equal(record.publicationAuthorized, false);
  assert.throws(() => transitionPublication(record, "publication_started"), /TRANSITION_INVALID/);
});

test("publication reservation requires slot and attempt identity", () => {
  const base = { ...createPublicationRecord({ articleId: "a", contentFingerprint: fingerprint }), state: "wix_draft_verified" };
  assert.throws(() => transitionPublication(base, "publication_reserved", {}), /RESERVATION_REQUIRED/);
  const reserved = transitionPublication(base, "publication_reserved", { slotKey: "2026-11:day-03", publicationAttemptId: "attempt-1" });
  assert.equal(reserved.state, "publication_reserved");
});

test("publication plan remains non-executable and binds policy, slot and identity", () => {
  const c = candidate({ wixDraftId: "draft-1" });
  const decision = evaluateAutopilotEligibility(c, { now: new Date("2026-11-23T10:00:00Z"), killSwitch: false });
  const plan = buildPublicationPlan({ candidate: c, decision, instant: "2026-11-03T09:05:00Z", killSwitch: false });
  assert.equal(plan.developmentReady, true); assert.equal(plan.executable, false); assert.equal(plan.reason, "production_activation_not_authorized");
  assert.equal(plan.siteId, publicationExecutorContract.siteId); assert.ok(plan.publicationAttemptId);
});

test("publication endpoint allowlist accepts only exact draft publish route", () => {
  assert.equal(assertPublicationEndpointAllowed("https://www.wixapis.com/blog/v3/draft-posts/draft-1/publish", "POST", "draft-1"), true);
  for (const [url, method] of [["https://www.wixapis.com/blog/v3/draft-posts/draft-2/publish", "POST"], ["https://www.wixapis.com/blog/v3/draft-posts/draft-1", "PATCH"], ["https://evil.example/blog/v3/draft-posts/draft-1/publish", "POST"]]) assert.throws(() => assertPublicationEndpointAllowed(url, method, "draft-1"), /NOT_ALLOWED/);
});

test("Firestore publication reservation atomically consumes month and slot", async () => {
  const reads = new Map(); const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body });
    if (!options.method) return { ok: false, status: 404, async json() { return {}; } };
    assert.match(url, /documents:commit$/); const body = JSON.parse(options.body); assert.equal(body.writes.length, 2);
    return { ok: true, status: 200, async json() { return { writeResults: [{}, {}] }; } };
  };
  const ledger = new FirestorePublicationLedger({ projectId: "synthetic-project", accessToken: "synthetic-token", fetchImpl });
  const c = candidate({ wixDraftId: "draft-1" }); const decision = evaluateAutopilotEligibility(c, { now: new Date("2026-11-23T10:00:00Z"), killSwitch: false });
  const plan = buildPublicationPlan({ candidate: c, decision, instant: "2026-11-03T09:05:00Z", killSwitch: false });
  const result = await reservePublicationSlot({ ledger, plan });
  assert.equal(result.reserved, true); assert.equal(result.count, 1); assert.equal(calls.filter((item) => item.url.includes("documents:commit")).length, 1); assert.equal(reads.size, 0);
});

test("concurrent Firestore reservation conflict cannot bypass quota or create another attempt", async () => {
  const ledger = new FirestorePublicationLedger({ projectId: "synthetic-project", accessToken: "synthetic-token", fetchImpl: async (_url, options = {}) => options.method === "POST" ? { ok: false, status: 409, async json() { return {}; } } : { ok: false, status: 404, async json() { return {}; } } });
  const plan = { developmentReady: true, slot: { monthKey: "2026-11", key: "2026-11:day-03" }, publicationAttemptId: "attempt", articleId: "article", contentFingerprint: fingerprint, wixDraftId: "draft" };
  const result = await reservePublicationSlot({ ledger, plan });
  assert.equal(result.reserved, false); assert.equal(result.reason, "concurrent_reservation_conflict");
});

test("normalized Wix verification covers SEO, every node, paragraph, link, CTA and checksum", () => {
  const dry = gate4DryRunExample().articleReview.wixDryRun;
  const actual = { id: "draft-1", siteId: dry.siteId, status: "DRAFT", ...structuredClone(dry.payload.draftPost) };
  const verification = verifyRetrievedDraft(actual, dry.payload.draftPost, "draft-1", dry.siteId);
  assert.equal(verification.completeBody, true); assert.equal(verification.paragraphs, true); assert.equal(verification.internalLinks, true); assert.equal(verification.cta, true);
  assert.equal(verification.expectedContentChecksum, verification.retrievedContentChecksum); assert.deepEqual(verification.unverifiableFields, []);
  assert.ok(normalizeWixDraft(actual).paragraphs.length > 1);
});

test("Wix verification rejects changed paragraphs, links, SEO fields, site and fingerprint-equivalent drift", () => {
  const dry = gate4DryRunExample().articleReview.wixDryRun;
  const mutations = [
    (d) => { d.richContent.nodes.find((n) => n.type === "PARAGRAPH").nodes[0].textData.text += " gewijzigd"; },
    (d) => { const p = d.richContent.nodes.find((n) => n.nodes?.some((x) => x.textData?.decorations?.length)); p.nodes.find((x) => x.textData?.decorations?.length).textData.decorations[0].linkData.link.url = "https://www.djelvio.nl/bedrijfsfeest"; },
    (d) => { d.seoData.tags.find((tag) => tag.type === "title").children = "Changed"; },
    (d) => { d.siteId = "wrong-site"; },
  ];
  for (const mutate of mutations) { const actual = { id: "draft-1", siteId: dry.siteId, status: "DRAFT", ...structuredClone(dry.payload.draftPost) }; mutate(actual); assert.throws(() => verifyRetrievedDraft(actual, dry.payload.draftPost, "draft-1", dry.siteId)); }
});

test("missing Wix site response field is explicitly reported, never silently asserted", () => {
  const dry = gate4DryRunExample().articleReview.wixDryRun;
  const actual = { id: "draft-1", status: "DRAFT", ...structuredClone(dry.payload.draftPost) };
  const result = verifyRetrievedDraft(actual, dry.payload.draftPost, "draft-1", dry.siteId);
  assert.deepEqual(result.unverifiableFields, ["wix_site_identity_response_field"]); assert.equal(result.requestBoundSiteIdentity, dry.siteId);
});

test("publication design has no CRM, Ads, communication, recurring-job or Global Groove reachability", () => {
  assert.equal(publicationExecutorContract.crmAccess, false); assert.equal(publicationExecutorContract.googleAdsMutationAccess, false); assert.equal(publicationExecutorContract.customerCommunicationAccess, false); assert.equal(publicationExecutorContract.globalGrooveAccess, false);
  for (const file of ["src/job.js", "src/engine.js", "src/cli.js"]) assert.doesNotMatch(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /blogPublicationExecutor/);
});

