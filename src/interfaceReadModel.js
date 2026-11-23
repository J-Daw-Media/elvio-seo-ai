import { buildSeoInterfaceContract, seoInterfaceCollections } from "./interfaceContract.js";

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
    return buildSeoInterfaceContract({
      ...sources,
      availability: inferAvailability(sources.collectionExecutions, now),
      attributionMissingFields: ["reliable acquisition source", "verified booking link", "verified revenue evidence"],
    }, { now, ...page });
  }
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

