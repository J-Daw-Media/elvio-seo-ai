import { sha256 } from "./identity.js";

const allowedStates = new Set(["reserved", "request_started", "created", "verified", "uncertain", "failed_before_request"]);

export function executionRecordId(fingerprint) {
  if (!/^[a-f0-9]{64}$/i.test(String(fingerprint || ""))) throw new Error("WIX_EXECUTION_FINGERPRINT_INVALID");
  return `wix-draft-execution-${fingerprint}`;
}

export function sanitizeExecutionRecord(record = {}) {
  const clean = structuredClone(record);
  for (const key of ["credential", "token", "apiKey", "authorization", "secret"]) delete clean[key];
  return clean;
}

export class FirestoreWixExecutionLedger {
  constructor({ projectId, accessToken, fetchImpl = fetch, database = "(default)", collection = "seo_wix_draft_executions", now = () => new Date().toISOString() } = {}) {
    if (!projectId || !accessToken) throw new Error("WIX_LEDGER_AUTH_REQUIRED");
    this.projectId = projectId; this.accessToken = accessToken; this.fetch = fetchImpl; this.database = database; this.collection = collection; this.now = now;
  }

  url(fingerprint) {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.database)}/documents/${encodeURIComponent(this.collection)}/${encodeURIComponent(executionRecordId(fingerprint))}`;
  }

  headers() { return { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" }; }

  async reserve(record) {
    const clean = sanitizeExecutionRecord({ ...record, state: "reserved", version: 1, createdAt: this.now(), updatedAt: this.now() });
    const url = `${this.url(clean.fingerprint)}?currentDocument.exists=false`;
    const response = await this.fetch(url, { method: "PATCH", headers: this.headers(), body: JSON.stringify(encodeDocument(clean)) });
    if (response.status === 409 || response.status === 412) return { created: false, record: await this.get(clean.fingerprint) };
    if (!response.ok) throw new Error(`WIX_LEDGER_RESERVE_HTTP_${response.status}`);
    return { created: true, record: decodeDocument(await response.json()) };
  }

  async get(fingerprint) {
    const response = await this.fetch(this.url(fingerprint), { method: "GET", headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`WIX_LEDGER_GET_HTTP_${response.status}`);
    return decodeDocument(await response.json());
  }

  async transition(fingerprint, expectedVersion, state, patch = {}) {
    if (!allowedStates.has(state)) throw new Error("WIX_LEDGER_STATE_INVALID");
    const current = await this.get(fingerprint);
    if (!current || current.version !== expectedVersion) throw new Error("WIX_LEDGER_CONFLICT");
    const { updateTime: _serverUpdateTime, ...payload } = current;
    const next = sanitizeExecutionRecord({ ...payload, ...patch, state, version: expectedVersion + 1, updatedAt: this.now() });
    const response = await this.fetch(`${this.url(fingerprint)}?currentDocument.updateTime=${encodeURIComponent(current.updateTime)}`, { method: "PATCH", headers: this.headers(), body: JSON.stringify(encodeDocument(next)) });
    if (response.status === 409 || response.status === 412) throw new Error("WIX_LEDGER_CONFLICT");
    if (!response.ok) throw new Error(`WIX_LEDGER_TRANSITION_HTTP_${response.status}`);
    return decodeDocument(await response.json());
  }
}

function encodeDocument(record) {
  return { fields: { payloadJson: { stringValue: JSON.stringify(sanitizeExecutionRecord(record)) }, checksum: { stringValue: sha256(sanitizeExecutionRecord(record)) } } };
}

function decodeDocument(document = {}) {
  const record = JSON.parse(document.fields?.payloadJson?.stringValue || "null");
  if (!record) throw new Error("WIX_LEDGER_DOCUMENT_INVALID");
  return { ...record, updateTime: document.updateTime || null };
}

