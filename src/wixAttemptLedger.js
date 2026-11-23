import { sha256, stableId } from "./identity.js";

export const WIX_ATTEMPT_SCOPE = "wix_blog_draft_create_once";
const terminalStates = new Set(["verified", "failed_before_request", "reconciled_no_draft", "reconciled_draft_removed", "blocked"]);
const activeStates = new Set(["authorized", "reserved", "request_started", "created", "uncertain", "reconciliation_pending"]);
const attemptStates = new Set([...terminalStates, ...activeStates]);

export function wixArticleId({ fingerprint, siteId }) {
  assertHex(fingerprint, "WIX_ARTICLE_FINGERPRINT_INVALID");
  if (!siteId) throw new Error("WIX_ARTICLE_SITE_REQUIRED");
  return stableId("wix-article", { fingerprint, siteId });
}

export function validateAuthorization(authorization, expected = {}) {
  if (!authorization?.authorizationId || !authorization?.attemptId) throw new Error("WIX_AUTHORIZATION_IDENTITY_REQUIRED");
  if (authorization.scope !== WIX_ATTEMPT_SCOPE) throw new Error("WIX_AUTHORIZATION_SCOPE_INVALID");
  if (authorization.status !== "authorized" || authorization.consumedAt) throw new Error("WIX_AUTHORIZATION_CONSUMED");
  if (authorization.articleFingerprint !== expected.fingerprint) throw new Error("WIX_AUTHORIZATION_FINGERPRINT_MISMATCH");
  if (authorization.transportChecksum !== expected.transportChecksum) throw new Error("WIX_AUTHORIZATION_TRANSPORT_MISMATCH");
  if (authorization.siteId !== expected.siteId) throw new Error("WIX_AUTHORIZATION_SITE_MISMATCH");
  return structuredClone(authorization);
}

export class InMemoryWixAttemptStore {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now; this.authorizations = new Map(); this.articles = new Map(); this.attempts = new Map(); this.reconciliations = new Map(); this.legacyRecords = new Map(); this.lock = Promise.resolve();
  }

  addAuthorization(record) {
    if (this.authorizations.has(record.authorizationId)) throw new Error("WIX_AUTHORIZATION_DUPLICATE");
    this.authorizations.set(record.authorizationId, structuredClone(record));
  }

  preserveLegacyRecord(record) {
    if (!record?.id) throw new Error("WIX_LEGACY_RECORD_ID_REQUIRED");
    if (this.legacyRecords.has(record.id)) throw new Error("WIX_LEGACY_RECORD_IMMUTABLE");
    this.legacyRecords.set(record.id, structuredClone(record));
  }

  async appendReconciliation({ reconciliationId, articleFingerprint, siteId, legacyRecordId, outcome, evidence = {}, at = this.now() }) {
    return this.atomic(async () => {
      if (!reconciliationId || this.reconciliations.has(reconciliationId)) throw new Error("WIX_RECONCILIATION_DUPLICATE");
      if (!this.legacyRecords.has(legacyRecordId)) throw new Error("WIX_RECONCILIATION_LEGACY_RECORD_REQUIRED");
      if (!new Set(["reconciled_no_draft", "reconciled_draft_removed"]).has(outcome)) throw new Error("WIX_RECONCILIATION_OUTCOME_INVALID");
      const articleId = wixArticleId({ fingerprint: articleFingerprint, siteId });
      const current = this.articles.get(articleId) || newArticle({ articleId, fingerprint: articleFingerprint, siteId });
      const reconciliation = { reconciliationId, articleId, articleFingerprint, legacyRecordId, outcome, evidence: structuredClone(evidence), at, appendOnly: true };
      this.reconciliations.set(reconciliationId, reconciliation);
      this.articles.set(articleId, { ...current, historicalUncertaintyResolved: true, reconciliationStatus: outcome, reconciliationReferences: [...current.reconciliationReferences, reconciliationId], updatedAt: at });
      return structuredClone(reconciliation);
    });
  }

  async reserveAuthorizedAttempt({ authorizationId, attemptId, parentAttemptId = null, fingerprint, siteId, transportChecksum, seoSlug, reviewId, publicationAuthorized = false }) {
    return this.atomic(async () => {
      const existing = this.attempts.get(attemptId);
      if (existing) {
        if (existing.authorizationId !== authorizationId || existing.fingerprint !== fingerprint) throw new Error("WIX_ATTEMPT_IDENTITY_CONFLICT");
        return { created: false, record: structuredClone(existing) };
      }
      const authorization = validateAuthorization(this.authorizations.get(authorizationId), { fingerprint, siteId, transportChecksum });
      if (authorization.attemptId !== attemptId) throw new Error("WIX_AUTHORIZATION_ATTEMPT_MISMATCH");
      const articleId = wixArticleId({ fingerprint, siteId });
      const article = this.articles.get(articleId) || newArticle({ articleId, fingerprint, siteId, seoSlug });
      if (!article.historicalUncertaintyResolved && this.legacyRecords.size) throw new Error("WIX_HISTORICAL_UNCERTAINTY_UNRESOLVED");
      if (article.verifiedWixDraftIds.length) throw new Error("WIX_ARTICLE_DRAFT_ALREADY_VERIFIED");
      if (article.knownPublicationIds.length) throw new Error("WIX_ARTICLE_ALREADY_PUBLISHED");
      if (article.activeAttemptId) throw new Error("WIX_ARTICLE_ACTIVE_ATTEMPT_CONFLICT");
      if (parentAttemptId && !this.attempts.has(parentAttemptId) && !this.legacyRecords.has(parentAttemptId)) throw new Error("WIX_PARENT_ATTEMPT_NOT_FOUND");
      const at = this.now();
      const attempt = { authorizationId, attemptId, articleId, fingerprint, parentAttemptId, siteId, transportChecksum, authorizationScope: authorization.scope, authorizationTimestamp: authorization.authorizedAt, reviewId, publicationAuthorized, state: "reserved", version: 1, createRequestCount: 0, credentialRevoked: false, createdAt: at, updatedAt: at };
      this.attempts.set(attemptId, attempt);
      this.authorizations.set(authorizationId, { ...authorization, status: "consumed", consumedAt: at, consumedByAttemptId: attemptId });
      this.articles.set(articleId, { ...article, seoSlug: article.seoSlug || seoSlug || null, activeAttemptId: attemptId, historicalAttemptReferences: [...article.historicalAttemptReferences, attemptId], updatedAt: at });
      return { created: true, record: structuredClone(attempt) };
    });
  }

  async transitionAttempt(attemptId, expectedVersion, state, patch = {}) {
    return this.atomic(async () => {
      if (!attemptStates.has(state)) throw new Error("WIX_ATTEMPT_STATE_INVALID");
      const current = this.attempts.get(attemptId);
      if (!current || current.version !== expectedVersion) throw new Error("WIX_ATTEMPT_CONFLICT");
      if ((current.createRequestCount || 0) > 1 || (patch.createRequestCount || 0) > 1) throw new Error("WIX_ATTEMPT_CREATE_LIMIT_EXCEEDED");
      const next = { ...current, ...structuredClone(patch), state, version: expectedVersion + 1, updatedAt: this.now() };
      this.attempts.set(attemptId, next);
      const article = this.articles.get(current.articleId);
      if (state === "verified") {
        if (!next.wixDraftId) throw new Error("WIX_ATTEMPT_VERIFIED_DRAFT_REQUIRED");
        this.articles.set(current.articleId, { ...article, activeAttemptId: null, verifiedWixDraftIds: unique([...article.verifiedWixDraftIds, next.wixDraftId]), duplicateStatus: "verified_draft_exists", updatedAt: this.now() });
      } else if (terminalStates.has(state)) {
        this.articles.set(current.articleId, { ...article, activeAttemptId: null, updatedAt: this.now() });
      }
      return structuredClone(next);
    });
  }

  async markCredentialRevoked(attemptId, verified) {
    return this.atomic(async () => {
      const current = this.attempts.get(attemptId); if (!current) throw new Error("WIX_ATTEMPT_NOT_FOUND");
      const next = { ...current, credentialRevoked: Boolean(verified), credentialRevocationVerifiedAt: verified ? this.now() : null, updatedAt: this.now() };
      this.attempts.set(attemptId, next); return structuredClone(next);
    });
  }

  async getAttempt(attemptId) { return clone(this.attempts.get(attemptId)); }
  async getArticleByFingerprint(fingerprint, siteId) { return clone(this.articles.get(wixArticleId({ fingerprint, siteId }))); }
  async atomic(fn) { const prior = this.lock; let release; this.lock = new Promise((resolve) => { release = resolve; }); await prior; try { return await fn(); } finally { release(); } }
}

export class AttemptExecutionLedgerAdapter {
  constructor({ store, authorizationId, attemptId, parentAttemptId = null, seoSlug = null } = {}) {
    if (!store || !authorizationId || !attemptId) throw new Error("WIX_ATTEMPT_ADAPTER_CONFIGURATION_REQUIRED");
    this.store = store; this.authorizationId = authorizationId; this.attemptId = attemptId; this.parentAttemptId = parentAttemptId; this.seoSlug = seoSlug;
  }
  async reserve(record) { return this.store.reserveAuthorizedAttempt({ ...record, authorizationId: this.authorizationId, attemptId: this.attemptId, parentAttemptId: this.parentAttemptId, transportChecksum: record.payloadChecksum, seoSlug: this.seoSlug }); }
  async get() { return this.store.getAttempt(this.attemptId); }
  async transition(_fingerprint, expectedVersion, state, patch = {}) { return this.store.transitionAttempt(this.attemptId, expectedVersion, state, patch); }
}

export class FirestoreRestTransactionClient {
  constructor({ projectId, accessToken, database = "(default)", fetchImpl = fetch } = {}) {
    if (!projectId || !accessToken) throw new Error("WIX_FIRESTORE_AUTH_REQUIRED");
    this.projectId = projectId; this.accessToken = accessToken; this.database = database; this.fetch = fetchImpl;
    this.root = `projects/${projectId}/databases/${database}`; this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }
  path(collection, id) { return `${this.root}/documents/${collection}/${id}`; }
  async transaction(work) {
    const begun = await this.json(`${this.base}/documents:beginTransaction`, { method: "POST", body: JSON.stringify({ options: { readWrite: {} } }) });
    const token = begun.transaction; if (!token) throw new Error("WIX_FIRESTORE_TRANSACTION_MISSING");
    try {
      const context = {
        read: async (paths) => this.batchGet(paths, token),
        commit: async (writes) => this.json(`${this.base}/documents:commit`, { method: "POST", body: JSON.stringify({ transaction: token, writes }) }),
      };
      return await work(context);
    } catch (error) {
      await this.json(`${this.base}/documents:rollback`, { method: "POST", body: JSON.stringify({ transaction: token }) }, true);
      throw error;
    }
  }
  async batchGet(paths, transaction) {
    const response = await this.fetch(`${this.base}/documents:batchGet`, { method: "POST", headers: this.headers(), body: JSON.stringify({ documents: paths, transaction }) });
    if (!response.ok) throw new Error(`WIX_FIRESTORE_BATCH_GET_HTTP_${response.status}`);
    const text = await response.text(); const rows = parseStreamedJson(text); const map = new Map();
    for (const row of rows) { if (row.found) map.set(row.found.name, decodePayloadDocument(row.found)); else if (row.missing) map.set(row.missing, null); }
    return map;
  }
  async get(path) { const value = await this.json(`https://firestore.googleapis.com/v1/${path}`, { method: "GET" }, true); return value ? decodePayloadDocument(value) : null; }
  async json(url, options, allow404 = false) {
    const response = await this.fetch(url, { ...options, headers: { ...this.headers(), ...(options.headers || {}) } });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`WIX_FIRESTORE_HTTP_${response.status}`);
    return response.status === 204 ? {} : response.json();
  }
  headers() { return { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" }; }
}

export class FirestoreWixAttemptStore {
  constructor({ client, now = () => new Date().toISOString(), collections = {} } = {}) {
    if (!client) throw new Error("WIX_FIRESTORE_CLIENT_REQUIRED");
    this.client = client; this.now = now; this.c = { authorizations: "seo_wix_authorizations", articles: "seo_wix_articles", attempts: "seo_wix_attempts", reconciliations: "seo_wix_reconciliations", ...collections };
  }
  paths({ authorizationId, articleId, attemptId, reconciliationId } = {}) { return { authorization: authorizationId && this.client.path(this.c.authorizations, authorizationId), article: articleId && this.client.path(this.c.articles, articleId), attempt: attemptId && this.client.path(this.c.attempts, attemptId), reconciliation: reconciliationId && this.client.path(this.c.reconciliations, reconciliationId) }; }
  async createAuthorization(record) {
    const path = this.paths({ authorizationId: record.authorizationId }).authorization;
    const write = writePayload(path, record, { exists: false });
    return this.client.transaction(async ({ read, commit }) => { const docs = await read([path]); if (docs.get(path)) throw new Error("WIX_AUTHORIZATION_DUPLICATE"); await commit([write]); return structuredClone(record); });
  }
  async appendReconciliation({ reconciliationId, articleFingerprint, siteId, legacyRecordId, outcome, evidence = {}, at = this.now() }) {
    const articleId = wixArticleId({ fingerprint: articleFingerprint, siteId }); const p = this.paths({ articleId, reconciliationId });
    return this.client.transaction(async ({ read, commit }) => {
      const docs = await read([p.article, p.reconciliation]); if (docs.get(p.reconciliation)) throw new Error("WIX_RECONCILIATION_DUPLICATE");
      const current = docs.get(p.article)?.payload || newArticle({ articleId, fingerprint: articleFingerprint, siteId });
      const reconciliation = { reconciliationId, articleId, articleFingerprint, legacyRecordId, outcome, evidence, at, appendOnly: true };
      const article = { ...current, historicalUncertaintyResolved: true, reconciliationStatus: outcome, reconciliationReferences: [...current.reconciliationReferences, reconciliationId], updatedAt: at };
      await commit([writePayload(p.reconciliation, reconciliation, { exists: false }), writePayload(p.article, article, docs.get(p.article) ? { updateTime: docs.get(p.article).updateTime } : { exists: false })]);
      return reconciliation;
    });
  }
  async reserveAuthorizedAttempt({ authorizationId, attemptId, parentAttemptId = null, fingerprint, siteId, transportChecksum, seoSlug, reviewId, publicationAuthorized = false }) {
    const articleId = wixArticleId({ fingerprint, siteId }); const p = this.paths({ authorizationId, articleId, attemptId });
    return this.client.transaction(async ({ read, commit }) => {
      const docs = await read([p.authorization, p.article, p.attempt]); const existing = docs.get(p.attempt)?.payload;
      if (existing) { if (existing.authorizationId !== authorizationId || existing.fingerprint !== fingerprint) throw new Error("WIX_ATTEMPT_IDENTITY_CONFLICT"); return { created: false, record: existing }; }
      const authorization = validateAuthorization(docs.get(p.authorization)?.payload, { fingerprint, siteId, transportChecksum });
      if (authorization.attemptId !== attemptId) throw new Error("WIX_AUTHORIZATION_ATTEMPT_MISMATCH");
      const article = docs.get(p.article)?.payload || newArticle({ articleId, fingerprint, siteId, seoSlug });
      if (!article.historicalUncertaintyResolved) throw new Error("WIX_HISTORICAL_UNCERTAINTY_UNRESOLVED");
      if (article.verifiedWixDraftIds.length) throw new Error("WIX_ARTICLE_DRAFT_ALREADY_VERIFIED"); if (article.knownPublicationIds.length) throw new Error("WIX_ARTICLE_ALREADY_PUBLISHED"); if (article.activeAttemptId) throw new Error("WIX_ARTICLE_ACTIVE_ATTEMPT_CONFLICT");
      const at = this.now(); const attempt = { authorizationId, attemptId, articleId, fingerprint, parentAttemptId, siteId, transportChecksum, authorizationScope: authorization.scope, authorizationTimestamp: authorization.authorizedAt, reviewId, publicationAuthorized, state: "reserved", version: 1, createRequestCount: 0, credentialRevoked: false, createdAt: at, updatedAt: at };
      const consumed = { ...authorization, status: "consumed", consumedAt: at, consumedByAttemptId: attemptId };
      const locked = { ...article, seoSlug: article.seoSlug || seoSlug || null, activeAttemptId: attemptId, historicalAttemptReferences: [...article.historicalAttemptReferences, attemptId], updatedAt: at };
      await commit([writePayload(p.attempt, attempt, { exists: false }), writePayload(p.authorization, consumed, { updateTime: docs.get(p.authorization).updateTime }), writePayload(p.article, locked, docs.get(p.article) ? { updateTime: docs.get(p.article).updateTime } : { exists: false })]);
      return { created: true, record: attempt };
    });
  }
  async transitionAttempt(attemptId, expectedVersion, state, patch = {}) {
    if (!attemptStates.has(state)) throw new Error("WIX_ATTEMPT_STATE_INVALID"); const attemptPath = this.paths({ attemptId }).attempt;
    return this.client.transaction(async ({ read, commit }) => {
      let docs = await read([attemptPath]); const currentDoc = docs.get(attemptPath); const current = currentDoc?.payload;
      if (!current || current.version !== expectedVersion) throw new Error("WIX_ATTEMPT_CONFLICT"); const articlePath = this.paths({ articleId: current.articleId }).article; docs = await read([articlePath]); const articleDoc = docs.get(articlePath); const article = articleDoc?.payload;
      const next = { ...current, ...patch, state, version: expectedVersion + 1, updatedAt: this.now() }; const writes = [writePayload(attemptPath, next, { updateTime: currentDoc.updateTime })];
      if (state === "verified") { if (!next.wixDraftId) throw new Error("WIX_ATTEMPT_VERIFIED_DRAFT_REQUIRED"); writes.push(writePayload(articlePath, { ...article, activeAttemptId: null, verifiedWixDraftIds: unique([...article.verifiedWixDraftIds, next.wixDraftId]), duplicateStatus: "verified_draft_exists", updatedAt: this.now() }, { updateTime: articleDoc.updateTime })); }
      else if (terminalStates.has(state)) writes.push(writePayload(articlePath, { ...article, activeAttemptId: null, updatedAt: this.now() }, { updateTime: articleDoc.updateTime }));
      await commit(writes); return next;
    });
  }
  async getAttempt(attemptId) { return (await this.client.get(this.paths({ attemptId }).attempt))?.payload || null; }
  async getArticleByFingerprint(fingerprint, siteId) { return (await this.client.get(this.paths({ articleId: wixArticleId({ fingerprint, siteId }) }).article))?.payload || null; }
  async markCredentialRevoked(attemptId, verified) { const current = await this.getAttempt(attemptId); if (!current) throw new Error("WIX_ATTEMPT_NOT_FOUND"); return this.transitionAttempt(attemptId, current.version, current.state, { credentialRevoked: Boolean(verified), credentialRevocationVerifiedAt: verified ? this.now() : null }); }
}

export function buildAttemptAuthorization({ authorizationId, attemptId, articleFingerprint, transportChecksum, siteId, authorizedAt, parentAttemptId = null }) {
  return { authorizationId, attemptId, articleFingerprint, transportChecksum, siteId, scope: WIX_ATTEMPT_SCOPE, status: "authorized", consumedAt: null, authorizedAt, parentAttemptId, immutableChecksum: sha256({ authorizationId, attemptId, articleFingerprint, transportChecksum, siteId, scope: WIX_ATTEMPT_SCOPE, authorizedAt, parentAttemptId }) };
}

function newArticle({ articleId, fingerprint, siteId, seoSlug = null }) { return { articleId, fingerprint, siteId, seoSlug, knownWixDraftIds: [], verifiedWixDraftIds: [], knownPublicationIds: [], activeAttemptId: null, historicalAttemptReferences: [], reconciliationReferences: [], reconciliationStatus: "unreconciled", historicalUncertaintyResolved: false, duplicateStatus: "clear", createdAt: null, updatedAt: null }; }
function assertHex(value, code) { if (!/^[a-f0-9]{64}$/i.test(String(value || ""))) throw new Error(code); }
function clone(value) { return value ? structuredClone(value) : null; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function writePayload(name, payload, precondition) { return { update: { name, fields: { payloadJson: { stringValue: JSON.stringify(payload) }, checksum: { stringValue: sha256(payload) } } }, currentDocument: precondition }; }
function decodePayloadDocument(document) { return { payload: JSON.parse(document.fields?.payloadJson?.stringValue || "null"), updateTime: document.updateTime || null, name: document.name }; }
function parseStreamedJson(text) { const trimmed = String(text || "").trim(); if (!trimmed) return []; try { const parsed = JSON.parse(trimmed); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); } }
