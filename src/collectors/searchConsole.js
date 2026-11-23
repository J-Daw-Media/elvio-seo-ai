import { evidenceRecord } from "../evidence.js";
import { retryableHttpError, withBoundedRetries } from "../retry.js";

export class SearchConsoleCollector {
  constructor({ accessToken, fetchImpl = fetch, property = "sc-domain:djelvio.nl", now, retry = {} } = {}) {
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.property = property;
    this.now = now;
    this.retry = retry;
  }

  async collect({ startDate, endDate, dimensions = ["query", "page", "date", "device", "country"], rowLimit = 25000 } = {}) {
    if (!this.accessToken) return { status: "unavailable", source: "google_search_console", reason: "read_only_authorization_missing", evidence: [] };
    let response;
    try {
      response = await withBoundedRetries(async () => {
        const result = await this.fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.property)}/searchAnalytics/query`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: Math.min(Math.max(rowLimit, 1), 25000), dataState: "final" }),
        });
        if (!result.ok) throw retryableHttpError(result.status);
        return result;
      }, this.retry);
    } catch (error) {
      return { status: "unavailable", source: "google_search_console", reason: error.message, retryable: Boolean(error.retryable), evidence: [] };
    }
    const data = await response.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return {
      status: "available",
      source: "google_search_console",
      property: this.property,
      writesPerformed: 0,
      rows: rows.length,
      evidence: rows.map((row) => evidenceRecord({
        source: "google_search_console",
        evidenceType: "first_party_measurement",
        confidence: "high",
        collectedAt: this.now?.(),
        measurementPeriod: { startDate, endDate },
        collectionVersion: "gsc-v1",
        keyword: dimensions.includes("query") ? row.keys?.[dimensions.indexOf("query")] : null,
        landingPage: dimensions.includes("page") ? row.keys?.[dimensions.indexOf("page")] : null,
        metrics: { keys: row.keys, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position },
        limitation: "Aggregated and privacy-filtered; not person-level attribution.",
      }, { now: this.now })),
    };
  }
}
