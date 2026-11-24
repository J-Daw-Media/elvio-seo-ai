import { buildSeoInterfaceContract, seoInterfaceCollections } from "./interfaceContract.js";
import { blogAutopilotPolicyV1 } from "./blogAutopilotPolicy.js";

export class SeoInterfaceReadModel {
  constructor({ reader, maxRecords = 100 } = {}) {
    if (!reader || typeof reader.list !== "function") throw new Error("SEO_INTERFACE_READER_REQUIRED");
    this.reader = reader;
    this.maxRecords = Math.min(Math.max(Number(maxRecords) || 100, 1), 100);
  }

  async read({ now = new Date().toISOString(), page = {} } = {}) {
    const entries = await Promise.all(Object.entries(seoInterfaceCollections).map(async ([key, collection]) => {
      const records = await this.reader.list(collection, { limit: this.maxRecords });
      if (!Array.isArray(records)) throw new Error(`SEO_INTERFACE_INVALID_COLLECTION_${collection}`);
      return [key, records];
    }));
    const sources = Object.fromEntries(entries);
    sources.blogAutopilot = buildPublisherReadModel(sources, now);
    return buildSeoInterfaceContract({
      ...sources,
      availability: inferAvailability(sources.collectionExecutions, now),
      attributionMissingFields: ["reliable acquisition source", "verified booking link", "verified revenue evidence"],
    }, { now, ...page });
  }
}

function buildPublisherReadModel(sources, now) {
  const events = [...(sources.publisherCandidateEvents || [])].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const latestByCandidate = new Map();
  for (const event of events) if (event.candidateId && !latestByCandidate.has(event.candidateId)) latestByCandidate.set(event.candidateId, event);
  const executions = [...(sources.publisherExecutions || [])].sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const latestExecution = executions[0] || null;
  const attempts = sources.publisherAttempts || [];
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit" }).formatToParts(new Date(now));
  const part = (type) => local.find((item) => item.type === type)?.value;
  const monthKey = `${part("year")}-${part("month")}`;
  const month = attempts.find((item) => item.monthKey === monthKey && item.id === `month-${monthKey}`) || { consumedCount: 0, exploratoryCount: 0 };
  const publicationHistory = attempts.filter((item) => item.articleId && !String(item.id || "").startsWith("slot-")).map((item) => ({ ...item, completedAt: item.updatedAt || item.createdAt, publicUrl: item.publicUrl || null }));
  const upcomingSlots = futureSlots(now, attempts);
  const incidentLatest = new Map();
  for (const incident of [...(sources.publisherIncidents || [])].sort((a, b) => String(a.createdAt || a.at || "").localeCompare(String(b.createdAt || b.at || "")))) if (incident.code || incident.incidentCode) incidentLatest.set(incident.code || incident.incidentCode, incident);
  return {
    policyId: "elvio-blog-autopilot-v1", mode: latestExecution?.mode || "readiness", activationState: latestExecution ? "production_readiness" : "not_activated",
    monthlyTargetMaximum: 6, publishedThisMonth: publicationHistory.filter((item) => item.monthKey === monthKey && item.state === "publicly_verified").length,
    consumedUnverifiedAttempts: Math.max(0, Number(month.consumedCount || 0) - publicationHistory.filter((item) => item.monthKey === monthKey && item.state === "publicly_verified").length),
    exploratoryAttemptsThisMonth: Number(month.exploratoryCount || 0),
    candidates: [...latestByCandidate.values()].map((event) => ({ id: event.candidateId, title: event.candidate?.topic || null, state: event.state, eligible: event.state === "eligible_for_publication", reasons: Array.isArray(event.reason) ? event.reason : event.reason ? [event.reason] : [], evidenceFreshness: event.candidate?.evidenceEvaluatedAt || null, imageStatus: event.candidate?.image?.eligible ? "approved" : event.state === "image_unavailable" ? "unavailable" : "pending" })),
    publicationHistory, upcomingSlots, latestExecutionStatus: latestExecution?.status || "not_activated",
    wixPublishingStatus: latestExecution?.mode === "full" ? "enabled" : "disabled", killSwitchActive: latestExecution?.killSwitch !== false,
    credentialHealth: latestExecution?.credentialHealth || "unknown",
    generationCostUsd: executions.reduce((sum, item) => sum + Number(item.generationUsage?.estimatedUsd || 0), 0),
    incidents: [...incidentLatest.values()].sort((a, b) => String(b.createdAt || b.at || "").localeCompare(String(a.createdAt || a.at || ""))).slice(0, 25),
    performance: { searchEvidenceAvailable: Boolean(sources.collectionExecutions?.length), organicAttributionAvailable: false, limitation: "Commercial attribution remains outside this milestone." },
  };
}

function futureSlots(now, attempts) {
  const instant = new Date(now);
  const localParts = new Intl.DateTimeFormat("en-CA", { timeZone: blogAutopilotPolicyV1.timezone, year: "numeric", month: "2-digit" }).formatToParts(instant);
  const value = (type) => Number(localParts.find((item) => item.type === type)?.value);
  const candidates = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const monthDate = new Date(Date.UTC(value("year"), value("month") - 1 + offset, 1));
    const year = monthDate.getUTCFullYear(); const month = monthDate.getUTCMonth() + 1;
    for (const slot of blogAutopilotPolicyV1.slots) {
      const localTime = amsterdamLocalToUtc(year, month, slot.dayOfMonth, slot.hour, slot.minute);
      if (localTime <= instant) continue;
      const monthKey = `${year}-${String(month).padStart(2, "0")}`; const slotKey = `${monthKey}:${slot.id}`;
      const recorded = attempts.find((item) => item.slotKey === slotKey || item.id === `slot-${slotKey}`);
      candidates.push({ id: slotKey, localTime: localTime.toISOString(), state: recorded?.state || "planned", articleId: recorded?.articleId || null, attemptId: recorded?.attemptId || null, quarantineReason: recorded?.incidentCode || null });
    }
  }
  return candidates.sort((a, b) => a.localTime.localeCompare(b.localTime)).slice(0, 6);
}

function amsterdamLocalToUtc(year, month, day, hour, minute) {
  let instant = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: blogAutopilotPolicyV1.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
    const get = (type) => Number(parts.find((item) => item.type === type)?.value);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    instant = new Date(instant.getTime() + Date.UTC(year, month - 1, day, hour, minute) - represented);
  }
  return instant;
}

const sourceAliases = Object.freeze({
  searchConsole: new Set(["searchconsole", "google_search_console", "search_console", "gsc"]),
  ga4: new Set(["ga4", "google_analytics_4", "google_analytics"]),
});

const executionTime = (row = {}) => row.completedAt || row.generatedAt || null;
const normalizedSource = (value) => String(value || "").replaceAll("-", "_").toLowerCase();

function sourceFromExecution(execution = {}, name) {
  const sources = execution.collectors || execution.sources;
  if (Array.isArray(sources)) return sources.find((item) => sourceAliases[name].has(normalizedSource(item?.source || item?.name))) || null;
  if (!sources || typeof sources !== "object") return null;
  return Object.entries(sources).map(([key, value]) => ({ key, value }))
    .find(({ key, value }) => sourceAliases[name].has(normalizedSource(value?.source || value?.name || key)))?.value || null;
}

function safeReason(value) {
  const reason = String(value || "").trim();
  if (!reason) return null;
  return /^[a-z0-9_ .:-]{1,120}$/i.test(reason) ? reason : "collector_error";
}

function collectorAvailability(executions, name, now) {
  const attempts = executions.map((execution) => ({ execution, source: sourceFromExecution(execution, name) }))
    .filter(({ source }) => source);
  if (!attempts.length) return { status: "unknown", lastAttemptAt: null, lastSuccessfulAt: null, reason: "collector_evidence_missing" };
  const latest = attempts[0];
  const successful = attempts.find(({ source }) => ["available", "success"].includes(String(source.status || source.state || "").toLowerCase()));
  const latestStatus = String(latest.source.status || latest.source.state || "unknown").toLowerCase();
  const lastSuccessfulAt = successful ? executionTime(successful.execution) : null;
  let status = ["available", "success"].includes(latestStatus) ? "available" : latestStatus === "unknown" ? "unknown" : "unavailable";
  if (status === "available" && lastSuccessfulAt) {
    const ageHours = Math.max(0, (new Date(now).getTime() - new Date(lastSuccessfulAt).getTime()) / 3_600_000);
    if (Number.isFinite(ageHours) && ageHours > 192) status = "stale";
  }
  return {
    status,
    lastAttemptAt: executionTime(latest.execution),
    lastSuccessfulAt,
    reason: status === "available" || status === "stale" ? null : safeReason(latest.source.reason || latest.source.error || latestStatus),
  };
}

export function inferAvailability(executions = [], now = new Date().toISOString()) {
  const ordered = [...executions].sort((a, b) => String(executionTime(b) || "").localeCompare(String(executionTime(a) || "")));
  return {
    searchConsole: collectorAvailability(ordered, "searchConsole", now),
    ga4: collectorAvailability(ordered, "ga4", now),
  };
}

