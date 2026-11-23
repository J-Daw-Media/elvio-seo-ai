import { attributionCandidate, appendLifecycle } from "./attribution.js";
import { stableId, sha256 } from "./identity.js";

export const attributionActivationVersion = "phase2-gate2-v1";
export const approvedAttributionCollections = Object.freeze([
  "leadAttribution", "wixOfferDeliveries", "quotationReferences",
  "automatedBookingConfirmations", "bookingAcquisitionLinks", "attributedBookingRevenue",
]);
export const attributionCollections = Object.freeze({
  candidates: "attribution_candidates_v1",
  conflicts: "attribution_conflicts_v1",
  executions: "attribution_executions_v1",
});

function decode(value = {}) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}

function decodeDocument(document = {}) {
  return decode({ mapValue: { fields: document.fields || {} } });
}

export class ApprovedAttributionReadClient {
  constructor({ projectId, accessToken, fetchImpl = fetch, maxRecords = 50 } = {}) {
    if (!projectId || !accessToken) throw new Error("attribution_read_configuration_missing");
    this.projectId = projectId; this.accessToken = accessToken; this.fetch = fetchImpl;
    this.maxRecords = Math.min(Math.max(Number(maxRecords) || 50, 1), 50);
  }
  async list(collection) {
    if (!approvedAttributionCollections.includes(collection)) throw new Error("ATTRIBUTION_COLLECTION_NOT_APPROVED");
    const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)/documents`;
    const response = await this.fetch(`${root}:runQuery`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], limit: this.maxRecords } }),
    });
    if (!response.ok) throw new Error(`attribution_read_${collection}_http_${response.status}`);
    const rows = await response.json();
    return (Array.isArray(rows) ? rows : []).filter((row) => row.document?.fields).map((row) => decodeDocument(row.document));
  }
}

function normalizedStatus(value) { return String(value || "").trim().toLowerCase(); }
function bySubmission(records = []) {
  const map = new Map();
  for (const record of records) {
    for (const key of new Set([record.submissionId, record.acquisitionId].filter(Boolean).map(String))) {
      const group = map.get(String(key)) || []; group.push(record); map.set(String(key), group);
    }
  }
  return map;
}

function safeInput(record = {}) {
  return {
    submissionId: record.submissionId || record.acquisitionId,
    formId: record.formId,
    formName: record.formName,
    receivedAt: record.receivedAt || record.originalEnquiryAt,
    landingPageUrl: record.landingPageUrl,
    referrer: record.referrer,
    utm_source: record.utm?.source,
    utm_medium: record.utm?.medium,
    utm_campaign: record.utm?.campaign,
    utm_content: record.utm?.content,
    utm_term: record.utm?.term,
    gclid: record.clickIds?.gclid,
    wbraid: record.clickIds?.wbraid,
    gbraid: record.clickIds?.gbraid,
  };
}

function lifecycleCandidate(record, deliveries, quotations, revenueRecords) {
  let candidate = attributionCandidate(safeInput(record));
  candidate = appendLifecycle(candidate, {
    stage: "inquiry", externalId: record.submissionId || record.acquisitionId,
    evidenceState: "verified", confirmed: true, occurredAt: record.receivedAt || record.originalEnquiryAt,
  });
  const delivery = deliveries.length === 1 ? deliveries[0] : null;
  const quotation = quotations.length === 1 ? quotations[0] : null;
  const quotationReference = quotation?.quotationReference || delivery?.quotationReference || record.outcome?.quotationReference;
  if (quotationReference && ["offer_sent", "client_offer_sent"].includes(normalizedStatus(record.outcome?.status || delivery?.status))) {
    candidate = appendLifecycle(candidate, { stage: "quotation", externalId: quotationReference, evidenceState: "verified", confirmed: true, occurredAt: delivery?.sentAt || quotation?.createdAt });
  }
  const matchingRevenue = revenueRecords.filter((item) => String(item.acquisitionId || item.submissionId || "") === String(record.submissionId || record.acquisitionId || ""));
  if (matchingRevenue.length === 1 && matchingRevenue[0].agreementNumber && Number(matchingRevenue[0].fullAgreedValue) > 0) {
    candidate = appendLifecycle(candidate, { stage: "confirmed_booking", externalId: matchingRevenue[0].agreementNumber, evidenceState: "verified", confirmed: true, occurredAt: matchingRevenue[0].confirmedAt });
  }
  return { candidate, ambiguousDelivery: deliveries.length > 1, ambiguousQuotation: quotations.length > 1, matchingRevenueCount: matchingRevenue.length };
}

export async function readAttributionSources(client) {
  const entries = await Promise.all(approvedAttributionCollections.map(async (collection) => [collection, await client.list(collection)]));
  return Object.fromEntries(entries);
}

export function prepareAttributionActivation(sources = {}, { maxCandidates = 50, generatedAt = new Date().toISOString() } = {}) {
  const leads = (sources.leadAttribution || [])
    .filter((record) => record && record.synthetic !== true && record.excludedFromReporting !== true && (record.submissionId || record.acquisitionId))
    .sort((a, b) => String(a.receivedAt || a.originalEnquiryAt || "").localeCompare(String(b.receivedAt || b.originalEnquiryAt || "")) || String(a.submissionId || a.acquisitionId).localeCompare(String(b.submissionId || b.acquisitionId)))
    .slice(0, Math.min(Math.max(Number(maxCandidates) || 50, 1), 50));
  const deliveries = bySubmission(sources.wixOfferDeliveries);
  const quotations = bySubmission(sources.quotationReferences);
  const versions = [];
  const conflicts = [];
  for (const lead of leads) {
    const key = String(lead.submissionId || lead.acquisitionId);
    const built = lifecycleCandidate(lead, deliveries.get(key) || [], quotations.get(key) || [], sources.attributedBookingRevenue || []);
    const conflictReasons = [built.candidate.acquisition.conflict ? "paid_organic_conflict" : null, built.ambiguousDelivery ? "ambiguous_delivery" : null, built.ambiguousQuotation ? "ambiguous_quotation" : null, built.matchingRevenueCount > 1 ? "ambiguous_booking_revenue" : null].filter(Boolean);
    const safeCandidate = { ...built.candidate, reconciliationStatus: conflictReasons.length ? "requires_review" : "candidate_only" };
    const sourceFingerprint = sha256(safeCandidate);
    const versionId = stableId("organic-attribution-version", { candidateId: safeCandidate.id, sourceFingerprint, version: attributionActivationVersion });
    versions.push({ id: versionId, candidateId: safeCandidate.id, sourceFingerprint, version: attributionActivationVersion, generatedAt, candidate: safeCandidate });
    for (const reason of conflictReasons) conflicts.push({ id: stableId("attribution-conflict", { versionId, reason }), versionId, candidateId: safeCandidate.id, reason, action: "manual_review", generatedAt });
  }
  const duplicateCandidateIds = versions.length - new Set(versions.map((item) => item.candidateId)).size;
  if (versions.length > 50 || conflicts.length > 50 || duplicateCandidateIds) throw new Error("ATTRIBUTION_BOUNDS_OR_IDENTITY_VIOLATION");
  const organic = versions.filter((item) => item.candidate.acquisition.channel === "organic_search");
  const metrics = {
    inquiriesEvaluated: versions.length,
    organicAttributedInquiries: organic.length,
    qualifiedOrganicInquiries: organic.filter((item) => item.candidate.lifecycle.some((event) => event.stage === "qualified_lead" && event.confirmed)).length,
    confirmedOrganicBookings: organic.filter((item) => item.candidate.lifecycle.some((event) => event.stage === "confirmed_booking" && event.confirmed)).length,
    verifiedAttributableBookingValue: 0,
    verifiedCollectedRevenue: 0,
    inquiryToBookingRate: organic.length ? organic.filter((item) => item.candidate.lifecycle.some((event) => event.stage === "confirmed_booking" && event.confirmed)).length / organic.length : null,
    unknownSourceInquiries: versions.filter((item) => item.candidate.acquisition.channel === "unknown").length,
    conflictingAttributionRecords: conflicts.length,
    missingLifecycleLinks: versions.filter((item) => !item.candidate.lifecycle.some((event) => event.stage === "confirmed_booking")).length,
  };
  const sourceFingerprint = sha256({ version: attributionActivationVersion, records: versions.map((item) => ({ id: item.id, sourceFingerprint: item.sourceFingerprint })), conflicts });
  return { version: attributionActivationVersion, sourceFingerprint, candidates: versions, conflicts, metrics, bounded: true, maxCandidates: 50 };
}

export async function persistAttributionActivation(store, prepared, { generatedAt = new Date().toISOString() } = {}) {
  const counts = {};
  let writesPerformed = 0;
  for (const [collection, records] of [[attributionCollections.candidates, prepared.candidates], [attributionCollections.conflicts, prepared.conflicts]]) {
    let created = 0;
    for (const record of records) { const result = await store.createIfAbsent(collection, record.id, record); if (result.created) created += 1; }
    counts[collection] = { received: records.length, created, duplicates: records.length - created }; writesPerformed += created;
  }
  const executionId = stableId("attribution-execution", { version: prepared.version, sourceFingerprint: prepared.sourceFingerprint });
  const execution = await store.createIfAbsent(attributionCollections.executions, executionId, { executionId, version: prepared.version, sourceFingerprint: prepared.sourceFingerprint, generatedAt, metrics: prepared.metrics, candidateCount: prepared.candidates.length, conflictCount: prepared.conflicts.length });
  writesPerformed += Number(execution.created);
  return { counts, execution: { id: executionId, created: Boolean(execution.created) }, writesPerformed };
}
