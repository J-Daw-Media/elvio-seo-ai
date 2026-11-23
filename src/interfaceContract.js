export const seoInterfaceSchemaVersion = "seo-intelligence-v1";

export const seoInterfaceCollections = Object.freeze({
  opportunities: "opportunities_v1",
  technicalFindings: "technical_findings_v1",
  contentBriefs: "content_briefs_v1",
  reviews: "owner_reviews_v1",
  derivedExecutions: "derived_executions_v1",
  attributionCandidates: "attribution_candidates_v1",
  attributionConflicts: "attribution_conflicts_v1",
  attributionExecutions: "attribution_executions_v1",
  collectionExecutions: "executions",
});

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => value == null ? null : String(value);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const iso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function freshness(timestamp, now = new Date()) {
  const parsed = iso(timestamp);
  if (!parsed) return "unavailable";
  const ageHours = Math.max(0, (now.getTime() - new Date(parsed).getTime()) / 3_600_000);
  if (ageHours <= 48) return "fresh";
  if (ageHours <= 192) return "delayed";
  return "stale";
}

function page(records, { offset = 0, limit = 25, max = 100 } = {}) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), max);
  const sorted = [...records].sort((a, b) => text(a.id)?.localeCompare(text(b.id)) || 0);
  return { items: sorted.slice(safeOffset, safeOffset + safeLimit), total: sorted.length, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + safeLimit < sorted.length };
}

function evidence(record = {}) {
  const provenance = record.provenance || {};
  return {
    sourceFingerprint: text(record.sourceFingerprint || provenance.sourceFingerprint),
    measurementPeriod: provenance.measurementPeriod || null,
    sources: asArray(provenance.sourceSummary).map((item) => ({ source: text(item.source), state: text(item.state || item.status) })),
  };
}

function opportunity(record = {}) {
  return {
    id: text(record.id),
    title: text(record.topic),
    targetSearchIntent: number(record.dimensions?.searchIntent),
    commercialRelevance: number(record.dimensions?.commercialRelevance),
    priorityScore: number(record.score),
    recommendedAction: text(record.recommendedAction),
    existingTargetPage: text(record.existingPage),
    evidenceConfidence: record.evidenceLimited ? "limited" : "supported",
    lastEvaluationDate: iso(record.provenance?.measurementPeriod?.end || record.generatedAt),
    reviewStatus: text(record.reviewStatus || "pending_review"),
    evidence: evidence(record),
  };
}

function technicalFinding(record = {}) {
  const issueType = text(record.type || record.code || record.status || "unclassified");
  return {
    id: text(record.id), affectedUrl: text(record.url || record.sourceUrl), issueType,
    category: issueType === "structured_data" ? "structured_data" : issueType === "heading" ? "headings" : issueType,
    priority: text(record.severity || (record.confidence === "high" ? "high" : "review")),
    evidence: text(record.status || record.code), confidence: text(record.confidence || "unverified"),
    recommendedCorrection: text(record.recommendation || record.recommendedAction),
    currentStatus: text(record.currentStatus || "open"), lastVerificationDate: iso(record.lastVerificationDate || record.generatedAt),
    ownerApprovalRequired: record.ownerApprovalRequired !== false,
  };
}

function brief(record = {}) {
  return {
    id: text(record.id), opportunityId: text(record.opportunityId), topic: text(record.primaryTopic),
    targetAudience: text(record.intendedAudience), searchIntent: text(record.targetSearchIntent),
    recommendation: text(record.recommendation), proposedTitle: text(record.proposedTitle),
    suggestedHeadings: asArray(record.headingOutline).map(text), commercialObjective: text(record.commercialObjective),
    internalLinkOpportunities: asArray(record.internalLinks).map(text), supportingEvidence: asArray(record.sourceEvidence).map(text),
    suggestedCta: text(record.callToAction), claimsRequiringVerification: asArray(record.factualVerification).map(text),
    imageryStatus: text(record.imageryStatus || "not_assessed"), contentStatus: text(record.status || "draft_only"),
    publishReady: false, confidence: text(record.confidence), limitations: asArray(record.limitations).map(text),
    gate4: {
      workflow: text(record.workflow || (record.targetPage ? "existing_page_optimization" : "new_article_candidate")),
      targetUrl: text(record.targetPage || record.targetUrl),
      currentContent: record.currentContent || null,
      proposedContent: record.proposedContent || null,
      proposedMetadata: record.proposedMetadata || null,
      validation: record.validation ? { valid: record.validation.valid === true, errors: asArray(record.validation.errors).map(text) } : null,
      contentFingerprint: text(record.contentFingerprint || record.fingerprint),
      wixDraftReadiness: text(record.wixDraftReadiness || "not_approved"),
      intendedWixAction: text(record.intendedWixAction || "owner_review_only"),
      editorialReadiness: text(record.editorialReadiness),
      seoEvidenceStatus: text(record.seoEvidenceStatus),
      cannibalizationAssessment: record.cannibalizationAssessment || null,
      factualVerification: record.factualVerification || null,
      imageStatus: text(record.imageStatus || record.imageryStatus || "image_pending"),
      publicationAuthorized: false,
    },
  };
}

function review(record = {}) {
  return {
    id: text(record.id), briefId: text(record.briefId), reviewStatus: text(record.approvalStatus || "pending_review"),
    contentFingerprint: text(record.contentFingerprint), publicationAuthorized: false,
    workflowState: text(record.state || record.workflowState || "owner_review"),
    wixDraftId: text(record.wixDraftId), wixDraftCreationAuthorized: false,
  };
}

function latest(records = []) {
  return [...records].sort((a, b) => String(b.generatedAt || b.completedAt || "").localeCompare(String(a.generatedAt || a.completedAt || "")))[0] || null;
}

export function buildSeoInterfaceContract(input = {}, options = {}) {
  const opportunities = asArray(input.opportunities).map(opportunity);
  const findings = asArray(input.technicalFindings).map(technicalFinding);
  const briefs = asArray(input.contentBriefs).map(brief);
  const reviews = asArray(input.reviews).map(review);
  const attributionExecution = latest(asArray(input.attributionExecutions));
  const metrics = attributionExecution?.metrics || input.attributionSummary || {};
  const evaluated = number(metrics.inquiriesEvaluated);
  const sufficient = Math.max(0, evaluated - number(metrics.unknownSourceInquiries));
  const collection = latest(asArray(input.collectionExecutions));
  const derived = latest(asArray(input.derivedExecutions));
  const latestDate = collection?.completedAt || collection?.generatedAt || derived?.generatedAt || null;
  const executionRows = [
    ["collection", collection], ["derived_memory", derived], ["attribution", attributionExecution],
  ].map(([kind, row]) => ({
    kind, id: text(row?.id || row?.executionId), status: text(row?.status || (row ? "success" : "unavailable")),
    completedAt: iso(row?.completedAt || row?.generatedAt), durationMs: number(row?.durationMs), warnings: asArray(row?.warnings).map(text),
  }));
  const sourceAvailability = (name) => {
    const value = input.availability?.[name];
    if (typeof value === "string") return { status: value, lastAttemptAt: null, lastSuccessfulAt: null, reason: null };
    return {
      status: text(value?.status || "unknown"),
      lastAttemptAt: iso(value?.lastAttemptAt),
      lastSuccessfulAt: iso(value?.lastSuccessfulAt),
      reason: text(value?.reason),
    };
  };
  const searchConsole = sourceAvailability("searchConsole");
  const ga4 = sourceAvailability("ga4");
  const autopilot = input.blogAutopilot || {};
  const autopilotQueue = asArray(autopilot.candidates).map((item) => ({ id: text(item.id), title: text(item.title), state: text(item.state), eligible: item.eligible === true, reasons: asArray(item.reasons).map(text), plannedSlot: text(item.plannedSlot), evidenceFreshness: text(item.evidenceFreshness), imageStatus: text(item.imageStatus) }));
  const publicationHistory = asArray(autopilot.publicationHistory).map((item) => ({ id: text(item.id), articleId: text(item.articleId), state: text(item.state), slotKey: text(item.slotKey), completedAt: iso(item.completedAt), publicUrl: text(item.publicUrl), contentFingerprint: text(item.contentFingerprint) }));
  return {
    schemaVersion: seoInterfaceSchemaVersion,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    readOnly: true,
    seoOverview: {
      latestSuccessfulCollectionDate: iso(latestDate), freshness: freshness(latestDate, new Date(options.now || Date.now())),
      searchConsoleAvailability: searchConsole.status,
      searchConsoleLastAttemptDate: searchConsole.lastAttemptAt,
      searchConsoleLastSuccessfulCollectionDate: searchConsole.lastSuccessfulAt,
      searchConsoleStatusReason: searchConsole.reason,
      ga4Availability: ga4.status,
      ga4LastAttemptDate: ga4.lastAttemptAt,
      ga4LastSuccessfulCollectionDate: ga4.lastSuccessfulAt,
      ga4StatusReason: ga4.reason,
      activeOpportunityCount: opportunities.length, technicalFindingCount: findings.length,
      contentBriefCount: briefs.length, pendingReviewCount: reviews.filter((item) => item.reviewStatus === "pending_review").length,
      attributionCoverage: { evaluated, sufficientSourceEvidence: sufficient, unknownSource: number(metrics.unknownSourceInquiries) },
      lastExecutionStatus: executionRows.find((item) => item.status !== "unavailable")?.status || "unavailable",
    },
    seoOpportunities: page(opportunities, options.opportunities),
    seoTechnicalFindings: page(findings, options.technicalFindings),
    seoContentBriefs: page(briefs, options.contentBriefs),
    seoReviews: page(reviews, options.reviews),
    seoAttributionSummary: {
      measurementPeriod: input.measurementPeriod || null,
      evaluatedInquiries: evaluated,
      verifiedOrganicInquiries: number(metrics.organicAttributedInquiries),
      qualifiedOrganicInquiries: number(metrics.qualifiedOrganicInquiries),
      confirmedOrganicBookings: number(metrics.confirmedOrganicBookings),
      verifiedAttributableBookingValue: number(metrics.verifiedAttributableBookingValue),
      verifiedCollectedRevenue: number(metrics.verifiedCollectedRevenue),
      unknownSourceInquiries: number(metrics.unknownSourceInquiries),
      attributionConflicts: number(metrics.conflictingAttributionRecords),
      missingBookingLinks: number(metrics.missingLifecycleLinks),
      conversionRate: number(metrics.organicAttributedInquiries) > 0 ? metrics.inquiryToBookingRate : null,
      limitation: "Unknown attribution does not mean the inquiry was not organic.",
    },
    attributionQuality: {
      evaluatedRecords: evaluated, sufficientSourceEvidence: sufficient,
      insufficientSourceEvidence: number(metrics.unknownSourceInquiries),
      verifiedBookingLinks: Math.max(0, evaluated - number(metrics.missingLifecycleLinks)),
      verifiedRevenueEvidence: number(metrics.verifiedCollectedRevenue) > 0 ? 1 : 0,
      missingFields: asArray(input.attributionMissingFields).map(text),
    },
    seoExecutionHealth: {
      executions: executionRows,
      scheduledCadence: ["Monday 08:00 Europe/Amsterdam", "First Monday monthly review via guarded Monday 09:00 schedule"],
      collectionTriggeredByPageLoad: false,
    },
    blogAutopilot: {
      policyId: text(autopilot.policyId || "elvio-blog-autopilot-v1"),
      mode: text(autopilot.mode || "full_autopilot"),
      activationState: text(autopilot.activationState || "development_only"),
      monthlyTargetMaximum: Math.min(6, Math.max(0, number(autopilot.monthlyTargetMaximum || 6))),
      publishedThisMonth: Math.max(0, number(autopilot.publishedThisMonth)),
      remainingMonthlyCapacity: Math.max(0, 6 - Math.max(0, number(autopilot.publishedThisMonth)) - Math.max(0, number(autopilot.consumedUnverifiedAttempts))),
      upcomingSlots: asArray(autopilot.upcomingSlots).slice(0, 6).map((item) => ({ id: text(item.id), localTime: iso(item.localTime), state: text(item.state || "planned"), articleId: text(item.articleId), attemptId: text(item.attemptId), quarantineReason: text(item.quarantineReason) })),
      nextUpcomingSlot: (() => { const item = asArray(autopilot.upcomingSlots).find((slot) => ["planned", "unused"].includes(slot.state)); return item ? { id: text(item.id), localTime: iso(item.localTime), state: text(item.state) } : null; })(),
      candidateQueue: page(autopilotQueue, { limit: 25, max: 50 }),
      heldCount: autopilotQueue.filter((item) => ["held_for_review", "policy_rejected", "uncertain"].includes(item.state)).length,
      validationFailureCount: Math.max(0, number(autopilot.validationFailureCount)),
      skippedSlotCount: asArray(autopilot.upcomingSlots).filter((item) => item.state === "skipped").length,
      failedAttemptCount: asArray(autopilot.upcomingSlots).filter((item) => ["failed_before_request", "uncertain", "publication_verification_failed"].includes(item.state)).length,
      wixPublishingStatus: text(autopilot.wixPublishingStatus || "disabled"),
      publicationHistory: page(publicationHistory, { limit: 25, max: 50 }),
      latestExecutionStatus: text(autopilot.latestExecutionStatus || "not_activated"),
      latestVerifiedPublication: [...publicationHistory].filter((item) => item.state === "published_verified").sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")))[0] || null,
      killSwitchActive: autopilot.killSwitchActive !== false,
      performance: { searchEvidenceAvailable: autopilot.performance?.searchEvidenceAvailable === true, organicAttributionAvailable: autopilot.performance?.organicAttributionAvailable === true, limitation: text(autopilot.performance?.limitation || "Publication and commercial attribution remain unavailable until separately activated and verified.") },
      readOnly: true,
    },
  };
}

