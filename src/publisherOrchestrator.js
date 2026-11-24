import { discoverOpportunities } from "./opportunityDiscoveryV2.js";
import { selectAutopilotTopics } from "./blogTopicSelection.js";
import { selectApprovedAsset } from "./creativeStudioRegistry.js";
import { prepareProductionDraft } from "./productionArticle.js";
import { evaluateAutopilotEligibility, autopilotRequiredChecks } from "./blogEligibility.js";
import { stableId } from "./identity.js";

const allowedModes = new Set(["readiness", "monitored_trial", "full"]);

function checksFor(draft) {
  const base = Object.fromEntries(autopilotRequiredChecks.map((key) => [key, true]));
  return {
    ...base,
    duplicateCheckPassed: draft.duplicateMatches.length === 0,
    cannibalizationCheckPassed: !draft.similarity.some((item) => item.similarity >= 0.58),
    internalLinksValid: draft.validation.errors.includes("unsafe_internal_link") === false,
    metadataComplete: Boolean(draft.title && draft.metaDescription && draft.slug),
    headingStructureValid: draft.h2s.length >= 3 && !/<h1\b/i.test(draft.bodyHtml),
    unsupportedClaimsAbsent: !draft.validation.errors.includes("unsupported_claim"),
    keywordStuffingAbsent: !draft.validation.errors.includes("keyword_stuffing"),
    contentFingerprintValid: /^[a-f0-9]{64}$/i.test(draft.contentFingerprint),
  };
}

export async function runPublisherPipeline({
  evidence = [], existingContent = [], assets = [], sourceFingerprint, mode = "readiness", killSwitch = true,
  now = new Date(), generate, persistEvent = async () => ({ created: false }), persistExecution = async () => ({ created: false }),
  publish = null, monthlyRecords = [], slotRecords = [], exploratoryAttemptsThisMonth = 0, runtimeHealth = {},
} = {}) {
  if (!allowedModes.has(mode)) throw new Error("PUBLISHER_MODE_INVALID");
  // Readiness runs may be repeated while validating production. Keep each audit
  // result durable, while scheduled publishing keeps an hour-stable identity so
  // duplicate slot invocations reconcile to the same execution.
  const executionIdentityTime = mode === "readiness" ? now.toISOString() : now.toISOString().slice(0, 13);
  const executionId = stableId("seo-publisher-execution", { sourceFingerprint, mode, at: executionIdentityTime });
  const discovered = discoverOpportunities({ evidence, existingContent, sourceFingerprint, evaluatedAt: now.toISOString() });
  for (const candidate of discovered) await persistEvent({ executionId, candidateId: candidate.id, state: candidate.state, reason: candidate.reason, candidate, at: now.toISOString() });
  const selection = selectAutopilotTopics({ opportunities: discovered, publishedTopics: existingContent.map((item) => item.title), now, maximum: 6, exploratoryMaximum: 2 });
  const candidate = selection.selected[0] || null;
  if (!candidate) {
    const result = { executionId, status: "completed_no_publication", mode, killSwitch, ...runtimeHealth, reason: "no_eligible_candidate", discoveredCount: discovered.length, eligibleCount: 0, writesToWix: 0, candidates: discovered };
    await persistExecution(result); return result;
  }
  if (typeof generate !== "function") throw new Error("PUBLISHER_GENERATOR_REQUIRED");
  await persistEvent({ executionId, candidateId: candidate.id, state: "generation_started", at: now.toISOString() });
  const generation = await generate(candidate);
  if (!generation?.validation?.passed || !generation.article) {
    await persistEvent({ executionId, candidateId: candidate.id, state: "validation_failed", reason: generation?.validation?.errors || ["generation_failed"], generationUsage: generation?.usage || null, at: now.toISOString() });
    const result = { executionId, status: "completed_no_publication", mode, killSwitch, ...runtimeHealth, reason: "generation_or_validation_failed", discoveredCount: discovered.length, eligibleCount: selection.selected.length, generationUsage: generation?.usage || null, writesToWix: 0 };
    await persistExecution(result); return result;
  }
  const draft = prepareProductionDraft(generation.article, candidate, existingContent);
  const image = selectApprovedAsset(assets, { topicTags: [candidate.category, "dj-equipment", "event-preparation"] });
  const enriched = {
    ...candidate, id: candidate.id, stableArticleId: candidate.stableArticleId, contentFingerprint: draft.contentFingerprint,
    checks: checksFor(draft), opportunityEvidenceStrength: candidate.evidenceStrength, evidenceEvaluatedAt: candidate.evidenceEvaluatedAt,
    image: image.available ? { eligible: true, ...image.asset } : { eligible: false }, contentCategory: candidate.category,
    requiredCommercialChanges: [], topicSelectedToFillSchedule: false,
  };
  const eligibility = evaluateAutopilotEligibility(enriched, { now, killSwitch: false, exploratoryAttemptsThisMonth });
  const state = !image.available ? "image_unavailable" : eligibility.eligible ? "eligible_for_publication" : "held";
  await persistEvent({ executionId, candidateId: candidate.id, state, reason: image.available ? eligibility.reasons : [image.reason], candidate: enriched, draft, generationUsage: generation.usage || null, at: now.toISOString() });
  if (mode === "readiness" || killSwitch || !eligibility.eligible) {
    const result = { executionId, status: "completed_no_publication", mode, killSwitch, ...runtimeHealth, reason: mode === "readiness" ? "readiness_mode" : killSwitch ? "kill_switch_active" : "candidate_held", discoveredCount: discovered.length, eligibleCount: Number(eligibility.eligible), candidateId: candidate.id, contentFingerprint: draft.contentFingerprint, generationUsage: generation.usage || null, writesToWix: 0 };
    await persistExecution(result); return result;
  }
  if (typeof publish !== "function") throw new Error("PUBLISHER_TRANSPORT_REQUIRED");
  const publication = await publish({ executionId, candidate: enriched, draft, image: image.asset, eligibility, now, monthlyRecords, slotRecords });
  const result = { executionId, status: publication.status, mode, killSwitch, ...runtimeHealth, reason: publication.reason || null, candidateId: candidate.id, contentFingerprint: draft.contentFingerprint, generationUsage: generation.usage || null, writesToWix: publication.writesToWix || 0, publication };
  await persistExecution(result); return result;
}

