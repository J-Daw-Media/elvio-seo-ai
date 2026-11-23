import { stableId, sha256 } from "./identity.js";
import { initialPhase2Opportunities, buildSeoBrief } from "./contentIntelligence.js";
import { headingDiagnosis, structuredDataDiagnosis } from "./technicalRemediation.js";

export const derivedMemoryVersion = "phase2-gate1-v1";
export const derivedCollections = Object.freeze({
  opportunities: "opportunities_v1",
  briefs: "content_briefs_v1",
  technicalFindings: "technical_findings_v1",
  reviews: "owner_reviews_v1",
  executions: "derived_executions_v1",
});

function versionedId(kind, value, sourceFingerprint) {
  return stableId(kind, { version: derivedMemoryVersion, sourceFingerprint, value });
}

export function prepareDerivedRecords({ measurementPeriod, sources = [], technicalAudit = null } = {}) {
  const sourceSummary = sources.map(({ quota: _quota, ...source }) => source).sort((a, b) => String(a.source).localeCompare(String(b.source)));
  const sourceFingerprint = sha256({ measurementPeriod, sources: sourceSummary, technicalPages: technicalAudit?.pages?.map((page) => ({ url: page.url, issues: page.issues, jsonLdTypes: page.jsonLdTypes, canonical: page.canonical })) || [] });
  const provenance = { version: derivedMemoryVersion, sourceFingerprint, measurementPeriod, sourceSummary };
  const opportunities = initialPhase2Opportunities().map((record) => ({
    ...record, id: versionedId("opportunity", { opportunityId: record.id }, sourceFingerprint), sourceOpportunityId: record.id, provenance,
  }));
  const briefs = opportunities.map((opportunity) => {
    const brief = buildSeoBrief(opportunity, { sourceEvidence: [`source:${sourceFingerprint}`] });
    return { ...brief, id: versionedId("brief", { opportunityId: opportunity.id }, sourceFingerprint), provenance };
  });
  const technicalFindings = [];
  for (const page of technicalAudit?.pages || []) {
    const heading = headingDiagnosis(page);
    if (heading.changeRequired) technicalFindings.push({ type: "heading", ...heading });
    for (const schema of structuredDataDiagnosis({ ...page, hasActualScheduledEvent: false })) technicalFindings.push({ type: "structured_data", ...schema });
    if ((page.issues || []).includes("missing_meta_description")) technicalFindings.push({ type: "metadata", url: page.url, status: "missing_meta_description", ownerApprovalRequired: true });
  }
  const versionedTechnical = technicalFindings.map((finding) => ({ ...finding, id: versionedId("technical-finding", finding, sourceFingerprint), provenance }));
  const reviews = briefs.map((brief) => ({
    id: versionedId("owner-review", { briefId: brief.id }, sourceFingerprint), briefId: brief.id,
    contentFingerprint: sha256(brief), approvalStatus: "pending_review", publicationAuthorized: false, provenance,
  }));
  if (opportunities.length > 25 || briefs.length > 25 || versionedTechnical.length > 100 || reviews.length > 25) throw new Error("DERIVED_RECORD_LIMIT_EXCEEDED");
  return { version: derivedMemoryVersion, sourceFingerprint, opportunities, briefs, technicalFindings: versionedTechnical, reviews };
}

export async function persistDerivedRecords(store, derived, { generatedAt = new Date().toISOString() } = {}) {
  const groups = [
    [derivedCollections.opportunities, derived.opportunities],
    [derivedCollections.briefs, derived.briefs],
    [derivedCollections.technicalFindings, derived.technicalFindings],
    [derivedCollections.reviews, derived.reviews],
  ];
  const counts = {};
  for (const [collection, records] of groups) {
    let created = 0;
    for (const record of records) if ((await store.createIfAbsent(collection, record.id, record)).created) created += 1;
    counts[collection] = { received: records.length, created, duplicates: records.length - created };
  }
  const executionId = versionedId("derived-execution", { sourceFingerprint: derived.sourceFingerprint }, derived.sourceFingerprint);
  const execution = await store.createIfAbsent(derivedCollections.executions, executionId, {
    id: executionId, version: derived.version, sourceFingerprint: derived.sourceFingerprint, generatedAt,
    counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value.received])),
    externalMutationsPerformed: 0,
  });
  return { counts, execution: { id: executionId, created: Boolean(execution.created) }, writesPerformed: Object.values(counts).reduce((sum, value) => sum + value.created, 0) + Number(execution.created) };
}
