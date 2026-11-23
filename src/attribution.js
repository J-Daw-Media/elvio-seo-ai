import { stableId, sha256 } from "./identity.js";

export const attributionEvidenceStates = Object.freeze(["observed", "verified", "inferred", "unavailable"]);
export const lifecycleStages = Object.freeze(["inquiry", "quotation", "qualified_lead", "confirmed_booking", "revenue"]);

function text(value, max = 2_000) { return value == null ? null : String(value).trim().slice(0, max) || null; }

function sitePath(value) {
  if (!value) return null;
  try {
    const url = new URL(value, "https://www.djelvio.nl");
    if (!/^(?:www\.)?djelvio\.nl$/i.test(url.hostname)) return null;
    return url.pathname;
  } catch { return null; }
}

function referrerOrigin(value) {
  if (!value) return null;
  try { const url = new URL(value); return `${url.protocol}//${url.hostname}${url.pathname}`; }
  catch { return null; }
}

export function acquisitionEvidence(input = {}) {
  const landingPage = sitePath(input.landingPageUrl || input.landingPage);
  const referrer = referrerOrigin(input.referrer);
  const source = text(input.utm_source, 500);
  const medium = text(input.utm_medium, 500);
  const clickIdHashes = Object.fromEntries(["gclid", "wbraid", "gbraid"].map((key) => [key, text(input[key], 500)]).filter(([, value]) => value).map(([key, value]) => [key, sha256(value)]));
  const observed = Boolean(landingPage || referrer || source || medium || Object.keys(clickIdHashes).length);
  const paidEvidence = Object.keys(clickIdHashes).length > 0 || /(?:cpc|ppc|paid|display)/i.test(`${source || ""} ${medium || ""}`);
  const organicEvidence = /organic/i.test(`${source || ""} ${medium || ""}`) || /google\.|bing\.|duckduckgo\./i.test(referrer || "");
  const conflict = paidEvidence && organicEvidence;
  const explicitOrganic = organicEvidence && !paidEvidence;
  return {
    state: observed ? (explicitOrganic ? "verified" : "observed") : "unavailable",
    channel: conflict ? "conflicting_paid_and_organic_evidence" : explicitOrganic ? "organic_search" : (paidEvidence ? "paid_search_evidence" : "unknown"),
    landingPage,
    referrer,
    utm: { source, medium, campaign: text(input.utm_campaign, 500), content: text(input.utm_content, 500), term: text(input.utm_term, 500) },
    clickIdHashes,
    conflict,
    limitation: conflict ? "Paid and organic evidence conflict; manual review is required." : explicitOrganic ? null : "Do not classify as organic without reliable source evidence.",
  };
}

export function attributionCandidate(input = {}) {
  if (!input.submissionId) throw new Error("submission_id_required");
  const acquisition = acquisitionEvidence(input);
  const originalReferences = {
    submissionId: text(input.submissionId), formId: text(input.formId), formName: text(input.formName),
    leadId: text(input.leadId), crmContactId: text(input.crmContactId), quotationReference: text(input.quotationReference),
    bookingId: text(input.bookingId), invoiceReference: text(input.invoiceReference), paymentReference: text(input.paymentReference),
  };
  return {
    id: stableId("organic-attribution", { submissionId: originalReferences.submissionId }),
    version: 1,
    originalReferences,
    analyticsIdHash: input.analyticsId ? sha256(String(input.analyticsId)) : null,
    acquisition,
    capturedAt: text(input.receivedAt || input.capturedAt) || new Date().toISOString(),
    lifecycle: [],
    reconciliationStatus: "candidate_only",
    productionWriteAllowed: false,
  };
}

export function appendLifecycle(candidate, event = {}) {
  if (!lifecycleStages.includes(event.stage)) throw new Error("invalid_lifecycle_stage");
  if (event.stage === "revenue" && (!event.confirmed || !Number.isFinite(Number(event.amount)))) throw new Error("verified_revenue_required");
  const record = {
    id: stableId("attribution-event", { attributionId: candidate.id, stage: event.stage, externalId: event.externalId || null }),
    stage: event.stage,
    externalId: text(event.externalId),
    evidenceState: attributionEvidenceStates.includes(event.evidenceState) ? event.evidenceState : "observed",
    confirmed: Boolean(event.confirmed),
    amount: event.stage === "revenue" ? Number(event.amount) : null,
    occurredAt: text(event.occurredAt) || new Date().toISOString(),
  };
  if (candidate.lifecycle.some((item) => item.id === record.id)) return structuredClone(candidate);
  return { ...structuredClone(candidate), lifecycle: [...candidate.lifecycle, record] };
}

export function reconcileAttribution(records = []) {
  const unique = new Map();
  const conflicts = [];
  for (const record of records) {
    const prior = unique.get(record.id);
    if (!prior) unique.set(record.id, structuredClone(record));
    else if (sha256(prior.acquisition) !== sha256(record.acquisition)) conflicts.push({ id: record.id, reason: "conflicting_source_evidence", action: "manual_review" });
  }
  return { candidates: [...unique.values()], conflicts, writesPerformed: 0 };
}

export function aggregateCommercialMetrics(records = []) {
  const totals = { inquiries: 0, qualifiedInquiries: 0, confirmedBookings: 0, attributableRevenue: 0, unknownSourceInquiries: 0 };
  for (const record of records) {
    totals.inquiries += 1;
    if (record.acquisition.state === "unavailable") totals.unknownSourceInquiries += 1;
    if (record.lifecycle.some((item) => item.stage === "qualified_lead" && item.confirmed)) totals.qualifiedInquiries += 1;
    if (record.lifecycle.some((item) => item.stage === "confirmed_booking" && item.confirmed)) totals.confirmedBookings += 1;
    totals.attributableRevenue += record.lifecycle.filter((item) => item.stage === "revenue" && item.confirmed).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }
  return { ...totals, inquiryToBookingRate: totals.inquiries ? totals.confirmedBookings / totals.inquiries : 0 };
}
