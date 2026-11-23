import { evidenceRecord } from "../evidence.js";

export async function collectAdsEvidence(readOnlyClient, period = {}) {
  if (!readOnlyClient?.diagnostics) return { status: "unavailable", source: "google_ads", reason: "read_model_missing", evidence: [] };
  const result = await readOnlyClient.diagnostics(period);
  const rows = result?.sections?.searchTerms?.rows || [];
  return {
    status: "available", source: "google_ads", writesPerformed: 0,
    evidence: rows.map((row) => evidenceRecord({
      source: "google_ads_read_only",
      evidenceType: "first_party_measurement",
      confidence: "medium",
      keyword: row.searchTermView?.searchTerm,
      metrics: row.metrics || {},
      commercialInterpretation: "Paid-search intent evidence; not verified organic volume.",
      limitation: "Do not infer organic search demand or rankings from Ads data.",
    })),
  };
}

export async function collectCrmEvidence(readModel) {
  if (!readModel?.listVerifiedOutcomes) return { status: "unavailable", source: "crm", reason: "read_model_missing", evidence: [] };
  const rows = await readModel.listVerifiedOutcomes();
  return {
    status: "available", source: "crm", writesPerformed: 0,
    evidence: rows.map((row) => evidenceRecord({
      source: "crm_verified_outcomes",
      evidenceType: "first_party_measurement",
      confidence: row.verified === true ? "high" : "low",
      landingPage: row.landingPage || null,
      metrics: { eventCategory: row.eventCategory, confirmedBookings: row.confirmedBookings, verifiedRevenue: row.verifiedRevenue },
      limitation: row.verified === true ? "" : "Outcome is not verified and must not drive revenue claims.",
    })),
  };
}
