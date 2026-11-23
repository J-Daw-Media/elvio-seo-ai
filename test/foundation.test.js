import test from "node:test";
import assert from "node:assert/strict";
import { stableId } from "../src/identity.js";
import { evidenceRecord } from "../src/evidence.js";
import { redact, safetyState, assertPersistentWriteAllowed } from "../src/safety.js";
import { SearchConsoleCollector } from "../src/collectors/searchConsole.js";
import { Ga4Collector } from "../src/collectors/ga4.js";
import { collectAdsEvidence, collectCrmEvidence } from "../src/collectors/adapters.js";
import { InMemorySeoStore, InMemoryRunLedger, FirestoreSeoStore, CloudStorageSnapshotStore, persistEvidence } from "../src/memory.js";
import { withBoundedRetries } from "../src/retry.js";
import { scoreOpportunity, deduplicateOpportunities } from "../src/scoring.js";
import { compareRequestedPricing, verifiedPricingContext } from "../src/pricingContext.js";
import { assertNoWixWrite, wixBlogDraftContract } from "../src/wixContract.js";
import { runSeoIntelligence } from "../src/engine.js";
import { metadataAccessToken, scopedServiceAccountAccessToken } from "../src/googleAuth.js";
import { runProductionDryRun } from "../src/job.js";
import { FirestoreRestClient, CloudStorageRestClient } from "../src/cloudPersistence.js";

const now = () => "2026-11-23T12:00:00.000Z";

test("stable identifiers are deterministic across key order", () => {
  assert.equal(stableId("x", { a: 1, b: 2 }), stableId("x", { b: 2, a: 1 }));
});

test("evidence requires provenance and classification", () => {
  assert.throws(() => evidenceRecord({}), /source/);
  const item = evidenceRecord({ source: "gsc", evidenceType: "first_party_measurement", confidence: "high" }, { now });
  assert.equal(item.collectedAt, now());
  assert.match(item.id, /^evidence:/);
});

test("PII and secrets are excluded from evidence and logs", () => {
  const value = redact({ email: "person@example.com", token: "secret", note: "Call +31612345678" });
  assert.equal(value.email, "[OMITTED_PII]");
  assert.equal(value.token, "[REDACTED]");
  assert.doesNotMatch(value.note, /12345678/);
});

test("safety defaults are dry-run with every business mutation unavailable", () => {
  assert.deepEqual(safetyState({}), {
    dryRun: true, killed: false, persistentWritesEnabled: false,
    wixWritesEnabled: false, adsMutationsEnabled: false, crmWritesEnabled: false,
  });
  assert.throws(() => assertPersistentWriteAllowed(safetyState({})), /DISABLED/);
});

test("kill switch stops the intelligence run", async () => {
  await assert.rejects(runSeoIntelligence({ state: { ...safetyState({}), killed: true } }), /KILL_SWITCH/);
});

test("Search Console collector fails closed without authorization", async () => {
  const result = await new SearchConsoleCollector().collect({ startDate: "2026-11-01", endDate: "2026-11-22" });
  assert.equal(result.status, "unavailable");
  assert.equal(result.writesPerformed, undefined);
});

test("Search Console collector emits first-party evidence and performs no writes", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ rows: [{ keys: ["dj bruiloft", "https://www.djelvio.nl/bruiloftsfeest", "2026-11-20", "MOBILE", "nld"], clicks: 2, impressions: 20, ctr: 0.1, position: 5.5 }] }));
  };
  const result = await new SearchConsoleCollector({ accessToken: "token", fetchImpl, now }).collect({ startDate: "2026-11-01", endDate: "2026-11-22" });
  assert.equal(result.status, "available");
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.evidence[0].keyword, "dj bruiloft");
  assert.deepEqual(result.evidence[0].measurementPeriod, { startDate: "2026-11-01", endDate: "2026-11-22" });
  assert.equal(result.evidence[0].collectionVersion, "gsc-v1");
  assert.match(request.url, /searchAnalytics\/query$/);
  assert.equal(request.options.method, "POST");
});

test("bounded retries recover from temporary quota failures", async () => {
  let calls = 0;
  const result = await new SearchConsoleCollector({
    accessToken: "token",
    retry: { maxAttempts: 3, baseDelayMs: 0, sleep: async () => {} },
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? new Response("quota", { status: 429 }) : new Response(JSON.stringify({ rows: [] }));
    },
  }).collect({ startDate: "2026-11-01", endDate: "2026-11-22" });
  assert.equal(result.status, "available");
  assert.equal(calls, 3);
});

test("bounded retries stop on a permanent authorization error", async () => {
  let calls = 0;
  const result = await new Ga4Collector({
    accessToken: "token",
    retry: { maxAttempts: 3, baseDelayMs: 0, sleep: async () => {} },
    fetchImpl: async () => { calls += 1; return new Response("forbidden", { status: 403 }); },
  }).collect();
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "http_403");
  assert.equal(calls, 1);
});

test("GA4 collector is organic-only and returns quota evidence", async () => {
  let body;
  const fetchImpl = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ rows: [{ dimensionValues: [{ value: "Organic Search" }, { value: "/bruiloft" }, { value: "google / organic" }], metricValues: [{ value: "4" }, { value: "3" }, { value: "0" }, { value: "0" }] }], propertyQuota: { tokensPerDay: { remaining: 199999 } } }));
  };
  const result = await new Ga4Collector({ accessToken: "token", fetchImpl, now }).collect();
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.evidence[0].metrics.sessions, 4);
  assert.equal(body.dimensionFilter.filter.stringFilter.value, "Organic Search");
});

test("one unavailable collector does not invalidate other evidence", async () => {
  const result = await runSeoIntelligence({
    state: safetyState({}), now,
    collectors: [
      async () => { throw new Error("gsc unavailable"); },
      async () => ({ status: "available", source: "ga4", evidence: [evidenceRecord({ source: "ga4", evidenceType: "first_party_measurement", confidence: "high" }, { now })] }),
    ],
  });
  assert.equal(result.sources.length, 2);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.externalMutationsPerformed, 0);
});

test("snapshot persistence is idempotent", async () => {
  const store = new InMemorySeoStore();
  const item = evidenceRecord({ source: "gsc", evidenceType: "first_party_measurement", confidence: "high" }, { now });
  assert.deepEqual(await persistEvidence(store, [item]), { received: 1, created: 1, duplicates: 0 });
  assert.deepEqual(await persistEvidence(store, [item]), { received: 1, created: 0, duplicates: 1 });
});

test("checkpoint recovery resumes only unfinished collector steps", async () => {
  const ledger = new InMemoryRunLedger();
  await ledger.checkpoint("weekly:2026-47", "gsc", { lastCheckpointAt: now() });
  assert.deepEqual(await ledger.pendingSteps("weekly:2026-47", ["gsc", "ga4", "technical"]), ["ga4", "technical"]);
  await ledger.checkpoint("weekly:2026-47", "gsc", { lastCheckpointAt: now() });
  assert.deepEqual((await ledger.read("weekly:2026-47")).completedSteps, ["gsc"]);
});

test("retry helper is bounded even when every attempt fails", async () => {
  let calls = 0;
  await assert.rejects(withBoundedRetries(async () => { calls += 1; const error = new Error("temporary"); error.retryable = true; throw error; }, {
    maxAttempts: 3, baseDelayMs: 0, sleep: async () => {},
  }), /temporary/);
  assert.equal(calls, 3);
});

test("cloud persistence requires explicit non-dry-run write gate", async () => {
  const state = safetyState({ SEO_DRY_RUN: "false", SEO_PERSISTENT_WRITES_ENABLED: "false" });
  await assert.rejects(new FirestoreSeoStore({ client: {}, state }).createIfAbsent("x", "y", {}), /DISABLED/);
  await assert.rejects(new CloudStorageSnapshotStore({ client: {}, state }).putImmutable("gsc", {}), /DISABLED/);
});

test("opportunity scoring is deterministic, bounded and never publish-ready", () => {
  const input = { topic: "DJ bruiloft Amsterdam", eventCategory: "wedding", firstPartyDemand: 90, commercialIntent: 100, siteCoverageGap: 50, rankingFeasibility: 60, evidenceConfidence: 80, geographicRelevance: 100, seasonality: 70, potentialBookingValue: 80 };
  const a = scoreOpportunity(input);
  const b = scoreOpportunity(input);
  assert.deepEqual(a, b);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.equal(a.sendOrPublishReady, false);
});

test("duplicate opportunities collapse to the highest supported score", () => {
  const base = { topic: "DJ bruiloft", eventCategory: "wedding", firstPartyDemand: 10 };
  const stronger = { ...base, firstPartyDemand: 90, commercialIntent: 90 };
  const result = deduplicateOpportunities([base, stronger]);
  assert.equal(result.length, 1);
  assert.equal(result[0].dimensions.firstPartyDemand, 90);
});

test("Ads and CRM adapters are strictly read-only and label limitations", async () => {
  const ads = await collectAdsEvidence({ diagnostics: async () => ({ sections: { searchTerms: { rows: [{ searchTermView: { searchTerm: "dj huren" }, metrics: { clicks: 3 } }] } } }) });
  const crm = await collectCrmEvidence({ listVerifiedOutcomes: async () => [{ verified: true, eventCategory: "wedding", confirmedBookings: 1, verifiedRevenue: 650 }] });
  assert.equal(ads.writesPerformed, 0);
  assert.match(ads.evidence[0].limitation, /organic/);
  assert.equal(crm.writesPerformed, 0);
});

test("authoritative pricing matches the owner-approved corporate price", () => {
  const pricing = verifiedPricingContext();
  assert.deepEqual(pricing.context.corporate, { upTo50: 650, from51To100: 750 });
  const comparison = compareRequestedPricing({ corporate: { upTo50: 650, from51To100: 750 } });
  assert.equal(comparison.safeForGeneratedPriceClaims, true);
  assert.deepEqual(comparison.conflicts, []);
});

test("Wix contract contains no Phase 0/1 write path", () => {
  assert.equal(wixBlogDraftContract.createDuringPhase01, false);
  assert.equal(wixBlogDraftContract.publishDuringPhase01, false);
  assert.throws(assertNoWixWrite, /NOT_AUTHORIZED/);
});

test("metadata authentication requires an access token and never logs credentials", async () => {
  assert.equal(await metadataAccessToken({ fetchImpl: async () => new Response(JSON.stringify({ access_token: "synthetic" })) }), "synthetic");
  await assert.rejects(metadataAccessToken({ fetchImpl: async () => new Response("forbidden", { status: 403 }) }), /http_403/);
});

test("scoped runtime authentication requests only read-only SEO scopes", async () => {
  let request;
  const token = await scopedServiceAccountAccessToken({
    serviceAccountEmail: "elvio-seo-ai@example.invalid",
    baseTokenProvider: async () => "base-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ accessToken: "scoped-token" }));
    },
  });
  const body = JSON.parse(request.options.body);
  assert.equal(token, "scoped-token");
  assert.match(request.url, /generateAccessToken$/);
  assert.deepEqual(body.scope, [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
  ]);
  assert.equal(body.scope.some((scope) => /webmasters(?!\.readonly)|analytics\.edit/.test(scope)), false);
});

test("production job remains dry-run and reports only aggregate collector summaries", async () => {
  const originalFetch = globalThis.fetch;
  const originalDryRun = process.env.SEO_DRY_RUN;
  process.env.SEO_DRY_RUN = "true";
  globalThis.fetch = async (url) => {
    if (String(url).includes("searchAnalytics")) return new Response(JSON.stringify({ rows: [] }));
    if (String(url).includes("analyticsdata")) return new Response(JSON.stringify({ rows: [], propertyQuota: {} }));
    throw new Error("unexpected_url");
  };
  try {
    const result = await runProductionDryRun({ tokenProvider: async () => "synthetic", now: new Date("2026-11-23T12:00:00Z") });
    assert.equal(result.mode, "dry_run");
    assert.equal(result.writesPerformed, 0);
    assert.equal(result.externalMutationsPerformed, 0);
    assert.equal(result.evidenceRecordCount, 0);
    assert.equal(JSON.stringify(result).includes("synthetic"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDryRun === undefined) delete process.env.SEO_DRY_RUN; else process.env.SEO_DRY_RUN = originalDryRun;
  }
});

test("cloud REST persistence uses create-only preconditions", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ generation: "1" }));
  };
  const firestore = new FirestoreRestClient({ projectId: "project", accessToken: "token", fetchImpl });
  const storage = new CloudStorageRestClient({ bucket: "bucket", accessToken: "token", fetchImpl });
  assert.equal((await firestore.createIfAbsent("records", "id", { safe: true })).created, true);
  assert.equal((await storage.putIfAbsent("snapshots/a.json", "{}", { ifGenerationMatch: 0 })).created, true);
  assert.match(requests[0].url, /documentId=id/);
  assert.match(requests[1].url, /ifGenerationMatch=0/);
});

test("persistent collection writes only to injected SEO stores and is replay safe", async () => {
  const originalFetch = globalThis.fetch;
  const original = { dry: process.env.SEO_DRY_RUN, writes: process.env.SEO_PERSISTENT_WRITES_ENABLED };
  process.env.SEO_DRY_RUN = "false";
  process.env.SEO_PERSISTENT_WRITES_ENABLED = "true";
  let ga4Request = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("searchAnalytics")) return new Response(JSON.stringify({ rows: [] }));
    if (String(url).includes("analyticsdata")) {
      ga4Request += 1;
      return new Response(JSON.stringify({
        rows: [{ dimensionValues: [{ value: "Organic Search" }, { value: "/diensten" }, { value: "google / organic" }], metricValues: [{ value: "2" }, { value: "1" }, { value: "0" }, { value: "0" }] }],
        propertyQuota: { tokensPerDay: { consumed: ga4Request, remaining: 200000 - ga4Request } },
      }));
    }
    throw new Error("unexpected_url");
  };
  const objects = new Set();
  const documents = new Set();
  const storageClient = { putIfAbsent: async (name) => objects.has(name) ? { created: false } : (objects.add(name), { created: true }) };
  const firestoreClient = { createIfAbsent: async (collection, id, value) => {
    const key = `${collection}/${id}`;
    if (documents.has(key)) return { created: false, value };
    documents.add(key); return { created: true, value };
  } };
  try {
    const options = { tokenProvider: async () => "scoped", cloudTokenProvider: async () => "cloud", firestoreClient, storageClient, now: new Date("2026-11-23T12:00:00Z") };
    const first = await runProductionDryRun(options);
    const second = await runProductionDryRun(options);
    assert.equal(first.writesPerformed, 2);
    assert.equal(second.writesPerformed, 0);
    assert.equal(objects.size, 1);
    assert.equal(documents.size, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (original.dry === undefined) delete process.env.SEO_DRY_RUN; else process.env.SEO_DRY_RUN = original.dry;
    if (original.writes === undefined) delete process.env.SEO_PERSISTENT_WRITES_ENABLED; else process.env.SEO_PERSISTENT_WRITES_ENABLED = original.writes;
  }
});

test("monthly schedule guard runs only on the first Amsterdam Monday", async () => {
  const original = process.env.SEO_RUN_MODE;
  process.env.SEO_RUN_MODE = "monthly";
  try {
    const skipped = await runProductionDryRun({
      tokenProvider: async () => { throw new Error("token_should_not_be_requested"); },
      now: new Date("2026-11-09T08:00:00Z"),
    });
    assert.equal(skipped.mode, "skipped");
    assert.equal(skipped.reason, "not_first_monday");
    assert.equal(skipped.writesPerformed, 0);
  } finally {
    if (original === undefined) delete process.env.SEO_RUN_MODE; else process.env.SEO_RUN_MODE = original;
  }
});
