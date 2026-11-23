import { evidenceRecord } from "../evidence.js";
import { retryableHttpError, withBoundedRetries } from "../retry.js";

export class Ga4Collector {
  constructor({ accessToken, fetchImpl = fetch, propertyId = "486194389", now, retry = {} } = {}) {
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.propertyId = propertyId;
    this.now = now;
    this.retry = retry;
  }

  async collect({ startDate = "28daysAgo", endDate = "yesterday" } = {}) {
    if (!this.accessToken) return { status: "unavailable", source: "ga4", reason: "read_only_authorization_missing", evidence: [] };
    let response;
    try {
      response = await withBoundedRetries(async () => {
        const result = await this.fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "landingPagePlusQueryString" }, { name: "sessionSourceMedium" }],
            metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }, { name: "totalRevenue" }],
            dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search", matchType: "EXACT" } } },
            returnPropertyQuota: true,
          }),
        });
        if (!result.ok) throw retryableHttpError(result.status);
        return result;
      }, this.retry);
    } catch (error) {
      return { status: "unavailable", source: "ga4", reason: error.message, retryable: Boolean(error.retryable), evidence: [] };
    }
    const data = await response.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return {
      status: "available", source: "ga4", propertyId: this.propertyId, writesPerformed: 0, rows: rows.length,
      quota: data.propertyQuota || null,
      evidence: rows.map((row) => evidenceRecord({
        source: "ga4",
        evidenceType: "first_party_measurement",
        confidence: "high",
        collectedAt: this.now?.(),
        measurementPeriod: { startDate, endDate },
        collectionVersion: "ga4-v1",
        landingPage: row.dimensionValues?.[1]?.value || null,
        metrics: {
          channel: row.dimensionValues?.[0]?.value,
          sourceMedium: row.dimensionValues?.[2]?.value,
          sessions: Number(row.metricValues?.[0]?.value || 0),
          engagedSessions: Number(row.metricValues?.[1]?.value || 0),
          keyEvents: Number(row.metricValues?.[2]?.value || 0),
          totalRevenue: Number(row.metricValues?.[3]?.value || 0),
        },
        limitation: "Key events and revenue are meaningful only after their GA4 definitions are independently validated.",
      }, { now: this.now })),
    };
  }
}
