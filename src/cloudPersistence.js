import { sha256 } from "./identity.js";

function authHeaders(token, extra = {}) {
  if (!token) throw new Error("cloud_access_token_missing");
  return { authorization: `Bearer ${token}`, ...extra };
}

export class FirestoreRestClient {
  constructor({ projectId, accessToken, fetchImpl = fetch, database = "(default)" } = {}) {
    this.projectId = projectId; this.accessToken = accessToken; this.fetch = fetchImpl; this.database = database;
  }
  async createIfAbsent(collection, id, value) {
    if (!this.projectId) throw new Error("firestore_project_missing");
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.database)}/documents/${encodeURIComponent(collection)}?documentId=${encodeURIComponent(id)}`;
    const response = await this.fetch(url, {
      method: "POST",
      headers: authHeaders(this.accessToken, { "content-type": "application/json" }),
      body: JSON.stringify({ fields: {
        payloadJson: { stringValue: JSON.stringify(value) },
        checksum: { stringValue: sha256(value) },
        createdAt: { timestampValue: new Date().toISOString() },
      } }),
    });
    if (response.status === 409) return { created: false, value };
    if (!response.ok) throw new Error(`firestore_create_http_${response.status}`);
    return { created: true, value };
  }
}

export class CloudStorageRestClient {
  constructor({ bucket, accessToken, fetchImpl = fetch } = {}) {
    this.bucket = bucket; this.accessToken = accessToken; this.fetch = fetchImpl;
  }
  async putIfAbsent(object, body, { ifGenerationMatch = 0 } = {}) {
    if (!this.bucket) throw new Error("storage_bucket_missing");
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=${encodeURIComponent(object)}&ifGenerationMatch=${encodeURIComponent(ifGenerationMatch)}`;
    const response = await this.fetch(url, {
      method: "POST",
      headers: authHeaders(this.accessToken, { "content-type": "application/json" }),
      body,
    });
    if (response.status === 412) return { created: false };
    if (!response.ok) throw new Error(`storage_create_http_${response.status}`);
    const payload = await response.json();
    return { created: true, generation: payload.generation || null };
  }
}
