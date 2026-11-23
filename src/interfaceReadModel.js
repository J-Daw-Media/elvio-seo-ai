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
      availability: inferAvailability(sources.collectionExecutions),
      attributionMissingFields: ["reliable acquisition source", "verified booking link", "verified revenue evidence"],
    }, { now, ...page });
  }
}

function inferAvailability(executions = []) {
  const latest = [...executions].sort((a, b) => String(b.completedAt || b.generatedAt || "").localeCompare(String(a.completedAt || a.generatedAt || "")))[0] || {};
  const collectors = latest.collectors || latest.sources || {};
  const state = (name) => collectors[name]?.status || collectors[name]?.state || "unavailable";
  return { searchConsole: state("searchConsole"), ga4: state("ga4") };
}

