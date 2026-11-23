import { SearchConsoleCollector } from "./collectors/searchConsole.js";
import { Ga4Collector } from "./collectors/ga4.js";
import { runSeoIntelligence } from "./engine.js";
import { scopedServiceAccountAccessToken } from "./googleAuth.js";
import { verifiedPricingContext } from "./pricingContext.js";
import { safetyState } from "./safety.js";
import { FirestoreRestClient, CloudStorageRestClient } from "./cloudPersistence.js";
import { FirestoreSeoStore, CloudStorageSnapshotStore } from "./memory.js";
import { stableId } from "./identity.js";
import { metadataAccessToken } from "./googleAuth.js";
import { auditSite } from "./technicalAudit.js";
import { prepareDerivedRecords, persistDerivedRecords } from "./derivedMemory.js";
import { ApprovedAttributionReadClient, readAttributionSources, prepareAttributionActivation, persistAttributionActivation } from "./attributionActivation.js";

function amsterdamDate(offsetDays = 0, now = new Date()) {
  const base = new Date(now.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(base);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function amsterdamCalendar(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: value.weekday, day: Number(value.day) };
}

function persistentEvidence(records = []) {
  return records.map(({ id: _id, collectedAt: _collectedAt, ...record }) => ({
    id: stableId("evidence", record),
    ...record,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function persistentSources(sources = []) {
  return sources.map(({ quota: _quota, ...source }) => source)
    .sort((a, b) => String(a.source).localeCompare(String(b.source)));
}

export async function runProductionDryRun({
  tokenProvider = () => scopedServiceAccountAccessToken({ serviceAccountEmail: process.env.SEO_RUNTIME_SERVICE_ACCOUNT }),
  cloudTokenProvider = metadataAccessToken,
  firestoreClient,
  storageClient,
  attributionReadClient,
  now = new Date(),
} = {}) {
  const runMode = process.env.SEO_RUN_MODE || "manual";
  const calendar = amsterdamCalendar(now);
  if (runMode === "monthly" && (calendar.weekday !== "Mon" || calendar.day > 7)) {
    return { mode: "skipped", runMode, reason: "not_first_monday", writesPerformed: 0, externalMutationsPerformed: 0 };
  }
  const state = safetyState();
  const derivedMemoryEnabled = String(process.env.SEO_DERIVED_MEMORY_ENABLED || "false").toLowerCase() === "true";
  const attributionMode = String(process.env.SEO_ATTRIBUTION_MODE || "disabled").toLowerCase();
  if (!["disabled", "dry_run", "persist"].includes(attributionMode)) throw new Error("INVALID_ATTRIBUTION_MODE");
  let cachedCloudToken = null;
  const getCloudToken = async () => { cachedCloudToken ||= await cloudTokenProvider(); return cachedCloudToken; };
  const token = await tokenProvider();
  const endDate = amsterdamDate(-1, now);
  const startDate = amsterdamDate(-29, now);
  const retry = { maxAttempts: 3, baseDelayMs: 500 };
  const gsc = new SearchConsoleCollector({
    accessToken: token,
    property: process.env.SEO_SEARCH_CONSOLE_PROPERTY || "sc-domain:djelvio.nl",
    retry,
  });
  const ga4 = new Ga4Collector({
    accessToken: token,
    propertyId: process.env.SEO_GA4_PROPERTY || "486194389",
    retry,
  });
  const result = await runSeoIntelligence({
    state,
    collectors: [
      () => gsc.collect({ startDate, endDate }),
      () => ga4.collect({ startDate, endDate }),
    ],
  });
  let technicalAudit = null;
  try {
    technicalAudit = await auditSite({});
  } catch (error) {
    technicalAudit = { status: "unavailable", reason: String(error.message || error), pages: [] };
  }
  const derived = prepareDerivedRecords({ measurementPeriod: { startDate, endDate, timeZone: "Europe/Amsterdam" }, sources: result.sources, technicalAudit });
  let attribution = null;
  if (attributionMode !== "disabled") {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "crm2026-497707";
    const reader = attributionReadClient || new ApprovedAttributionReadClient({ projectId, accessToken: await getCloudToken(), maxRecords: 50 });
    const attributionSources = await readAttributionSources(reader);
    attribution = prepareAttributionActivation(attributionSources, { maxCandidates: 50, generatedAt: result.generatedAt });
  }
  const summary = {
    mode: result.mode,
    generatedAt: result.generatedAt,
    measurementPeriod: { startDate, endDate, timeZone: "Europe/Amsterdam" },
    sources: result.sources,
    evidenceRecordCount: result.evidence.length,
    writesPerformed: result.writesPerformed,
    externalMutationsPerformed: result.externalMutationsPerformed,
    pricing: verifiedPricingContext(),
    technicalAudit: { status: technicalAudit.status || "available", urlCount: technicalAudit.urlCount || 0, findingCount: derived.technicalFindings.length },
    derivedMemory: {
      enabled: derivedMemoryEnabled,
      version: derived.version,
      sourceFingerprint: derived.sourceFingerprint,
      opportunityCount: derived.opportunities.length,
      briefCount: derived.briefs.length,
      technicalFindingCount: derived.technicalFindings.length,
      reviewCount: derived.reviews.length,
      writesPerformed: 0,
    },
    attribution: attribution ? {
      enabled: true, mode: attributionMode, version: attribution.version, sourceFingerprint: attribution.sourceFingerprint,
      candidateCount: attribution.candidates.length, conflictCount: attribution.conflicts.length,
      metrics: attribution.metrics, bounded: attribution.bounded, maxCandidates: attribution.maxCandidates,
      writesPerformed: 0, externalSourceWritesPerformed: 0,
    } : { enabled: false, mode: "disabled", writesPerformed: 0, externalSourceWritesPerformed: 0 },
  };
  if (state.persistentWritesEnabled && !state.dryRun) {
    const cloudToken = await getCloudToken();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "crm2026-497707";
    const bucket = process.env.SEO_STORAGE_BUCKET;
    const firestore = new FirestoreSeoStore({
      client: firestoreClient || new FirestoreRestClient({ projectId, accessToken: cloudToken }),
      state,
    });
    const storage = new CloudStorageSnapshotStore({
      client: storageClient || new CloudStorageRestClient({ bucket, accessToken: cloudToken }),
      state,
    });
    const snapshot = await storage.putImmutable("collection", {
      measurementPeriod: summary.measurementPeriod,
      sources: persistentSources(result.sources),
      evidence: persistentEvidence(result.evidence),
      opportunities: result.opportunities,
      pricing: summary.pricing,
    });
    const executionId = stableId("execution", { measurementPeriod: summary.measurementPeriod, version: "phase1b-v2" });
    const execution = await firestore.createIfAbsent("executions", executionId, {
      ...summary,
      executionId,
      snapshotObject: snapshot.object,
      snapshotChecksum: snapshot.checksum,
    });
    summary.persistence = {
      snapshotObject: snapshot.object,
      snapshotChecksum: snapshot.checksum,
      snapshotCreated: Boolean(snapshot.created),
      executionCreated: Boolean(execution.created),
    };
    let derivedWrites = 0;
    if (derivedMemoryEnabled) {
      const first = await persistDerivedRecords(firestore, derived, { generatedAt: result.generatedAt });
      const replay = await persistDerivedRecords(firestore, derived, { generatedAt: result.generatedAt });
      if (replay.writesPerformed !== 0) throw new Error("DERIVED_REPLAY_NOT_IDEMPOTENT");
      summary.derivedMemory.persistence = { first, replay };
      summary.derivedMemory.writesPerformed = first.writesPerformed;
      summary.derivedMemory.replaySafe = true;
      derivedWrites = first.writesPerformed;
    }
    let attributionWrites = 0;
    if (attributionMode === "persist" && attribution) {
      const first = await persistAttributionActivation(firestore, attribution, { generatedAt: result.generatedAt });
      const replay = await persistAttributionActivation(firestore, attribution, { generatedAt: result.generatedAt });
      if (replay.writesPerformed !== 0) throw new Error("ATTRIBUTION_REPLAY_NOT_IDEMPOTENT");
      summary.attribution.persistence = { first, replay };
      summary.attribution.writesPerformed = first.writesPerformed;
      summary.attribution.replaySafe = true;
      attributionWrites = first.writesPerformed;
    }
    summary.writesPerformed = Number(snapshot.created) + Number(execution.created) + derivedWrites + attributionWrites;
  }
  return summary;
}

if (process.argv[1] && new URL(import.meta.url).pathname.replace(/^\/(.:\/)/, "$1") === process.argv[1].replaceAll("\\", "/")) {
  runProductionDryRun()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => { console.error(JSON.stringify({ status: "failed", reason: error.message })); process.exitCode = 1; });
}
