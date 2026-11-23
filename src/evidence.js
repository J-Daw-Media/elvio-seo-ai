import { stableId } from "./identity.js";
import { redact } from "./safety.js";

const TYPES = new Set(["first_party_measurement", "verified_public_fact", "third_party_estimate", "hypothesis", "missing_evidence"]);
const CONFIDENCE = new Set(["high", "medium", "low", "unknown"]);

export function evidenceRecord(input, { now = () => new Date().toISOString() } = {}) {
  const source = String(input?.source ?? "").trim();
  const evidenceType = String(input?.evidenceType ?? "missing_evidence");
  const confidence = String(input?.confidence ?? "unknown");
  if (!source) throw new Error("evidence_source_required");
  if (!TYPES.has(evidenceType)) throw new Error("invalid_evidence_type");
  if (!CONFIDENCE.has(confidence)) throw new Error("invalid_confidence");
  const record = redact({
    source,
    collectedAt: input.collectedAt || now(),
    measurementPeriod: input.measurementPeriod || null,
    collectionVersion: input.collectionVersion || "elvio-seo-ai-v1",
    evidenceType,
    confidence,
    landingPage: input.landingPage || null,
    keyword: input.keyword || null,
    metrics: input.metrics || {},
    commercialInterpretation: input.commercialInterpretation || "",
    recommendedAction: input.recommendedAction || "",
    limitation: input.limitation || "",
  });
  return { id: stableId("evidence", record), ...record };
}
