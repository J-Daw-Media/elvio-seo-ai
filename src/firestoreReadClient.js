const decodeValue = (value = {}) => {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
};

const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));

export class FirestoreInterfaceReader {
  constructor({ projectId, accessTokenProvider, fetchImpl = fetch, namespace = "elvio_seo_ai", database = "(default)", maxRecords = 100 } = {}) {
    if (!projectId) throw new Error("SEO_INTERFACE_PROJECT_REQUIRED");
    if (typeof accessTokenProvider !== "function") throw new Error("SEO_INTERFACE_TOKEN_PROVIDER_REQUIRED");
    this.projectId = projectId;
    this.accessTokenProvider = accessTokenProvider;
    this.fetch = fetchImpl;
    this.namespace = namespace;
    this.database = database;
    this.maxRecords = Math.min(Math.max(Number(maxRecords) || 100, 1), 100);
  }

  async list(collection, { limit = this.maxRecords } = {}) {
    if (!/^[a-z0-9_]+$/.test(collection)) throw new Error("SEO_INTERFACE_COLLECTION_INVALID");
    const boundedLimit = Math.min(Math.max(Number(limit) || 1, 1), this.maxRecords);
    const collectionId = `${this.namespace}_${collection}`;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.database)}/documents:runQuery`;
    const token = await this.accessTokenProvider();
    const response = await this.fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit: boundedLimit } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`SEO_INTERFACE_FIRESTORE_HTTP_${response.status}`);
    const rows = await response.json();
    return rows.flatMap((row) => {
      const fields = row.document?.fields;
      if (!fields) return [];
      if (fields.payloadJson?.stringValue) return [JSON.parse(fields.payloadJson.stringValue)];
      return [decodeFields(fields)];
    });
  }
}
