import { sha256 } from "./identity.js";
import { buildWixDraftPayload } from "./wixDrafts.js";
import { uploadVerifiedImage } from "./wixMedia.js";

export const FIRST_PUBLICATION_SCOPE = "wix_first_publication_once";
const DRAFT_ID = "cf13a806-22ee-43c2-bb29-c362132bf325";
const PUBLISH_FINGERPRINT = "60fe00f6f7262243b9e64200f66747ab4c6c818a6a8b9c1c06c856560726b765";
const SITE_ID = "fe9762c6-cdbd-404c-ba42-c2b834b052e2";
const terminalStates = new Set(["public_verified", "failed_before_write", "quarantined"]);

export function buildFirstPublicationAuthorization({ authorizationId, attemptId, approvedAt } = {}) {
  if (!authorizationId || !attemptId || !approvedAt) throw new Error("FIRST_PUBLICATION_AUTHORIZATION_FIELDS_REQUIRED");
  const authorization = {
    authorizationId, attemptId, approvedAt, scope: FIRST_PUBLICATION_SCOPE,
    publicationFingerprint: PUBLISH_FINGERPRINT, siteId: SITE_ID, draftId: DRAFT_ID,
    imageUploadAuthorized: true, draftUpdateAuthorized: true, publicationAuthorized: true,
  };
  return { ...authorization, immutableChecksum: sha256(authorization) };
}

export class InMemoryFirstPublicationLedger {
  constructor({ now = () => new Date().toISOString() } = {}) { this.now = now; this.record = null; }
  async reserve(input) {
    if (this.record) return { created: false, record: structuredClone(this.record) };
    this.record = { ...structuredClone(input), state: "reserved", version: 1, requestCounts: { imageUrl: 0, imageUpload: 0, draftUpdate: 0, publish: 0 }, credentialRevoked: false, createdAt: this.now(), updatedAt: this.now() };
    return { created: true, record: structuredClone(this.record) };
  }
  async transition(expectedVersion, state, patch = {}) {
    if (!this.record || this.record.version !== expectedVersion) throw new Error("FIRST_PUBLICATION_LEDGER_CONFLICT");
    this.record = { ...this.record, ...structuredClone(patch), state, version: expectedVersion + 1, updatedAt: this.now() };
    return structuredClone(this.record);
  }
  async get() { return this.record ? structuredClone(this.record) : null; }
}

export class FirestoreFirstPublicationLedger {
  constructor({ client, collection = "seo_wix_first_publication_trials", now = () => new Date().toISOString() } = {}) {
    if (!client) throw new Error("FIRST_PUBLICATION_FIRESTORE_CLIENT_REQUIRED");
    this.client = client; this.collection = collection; this.now = now; this.id = PUBLISH_FINGERPRINT;
  }
  path() { return this.client.path(this.collection, this.id); }
  async reserve(input) {
    const path = this.path();
    return this.client.transaction(async ({ read, commit }) => {
      const existing = (await read([path])).get(path);
      if (existing) return { created: false, record: existing.payload };
      const record = { ...structuredClone(input), state: "reserved", version: 1, requestCounts: { imageUrl: 0, imageUpload: 0, draftUpdate: 0, publish: 0 }, credentialRevoked: false, createdAt: this.now(), updatedAt: this.now() };
      await commit([writePayload(path, record, { exists: false })]);
      return { created: true, record };
    });
  }
  async transition(expectedVersion, state, patch = {}) {
    const path = this.path();
    return this.client.transaction(async ({ read, commit }) => {
      const currentDoc = (await read([path])).get(path); const current = currentDoc?.payload;
      if (!current || current.version !== expectedVersion) throw new Error("FIRST_PUBLICATION_LEDGER_CONFLICT");
      const next = { ...current, ...structuredClone(patch), state, version: expectedVersion + 1, updatedAt: this.now() };
      await commit([writePayload(path, next, { updateTime: currentDoc.updateTime })]);
      return next;
    });
  }
  async get() { return (await this.client.get(this.path()))?.payload || null; }
}

export async function executeFirstPublicationTrial({
  packageData, authorization, ledger, credentialSession, imageBytes, fetchImpl = fetch,
  verifyDraft, verifyPublic, killSwitch = true, timeoutMs = 15000, hashBytes = sha256,
} = {}) {
  validatePreflight({ packageData, authorization, ledger, credentialSession, imageBytes, verifyDraft, verifyPublic, killSwitch, hashBytes });
  const reservation = await ledger.reserve({
    authorizationId: authorization.authorizationId, attemptId: authorization.attemptId,
    publicationFingerprint: packageData.publicationFingerprint, contentFingerprint: packageData.article.contentFingerprint,
    imageChecksum: packageData.image.checksum, siteId: packageData.wix.siteId, draftId: packageData.wix.existingHistoricalDraftId,
  });
  if (!reservation.created) return replay(reservation.record);
  let record = reservation.record; let session;
  try {
    session = await credentialSession.acquire();
    if (!session?.credential || session.siteId !== SITE_ID) throw new Error("FIRST_PUBLICATION_CREDENTIAL_SITE_MISMATCH");
    const headers = { authorization: session.credential, "wix-site-id": SITE_ID, "content-type": "application/json" };
    const query = await requestJson(fetchImpl, "https://www.wixapis.com/blog/v3/draft-posts/query", { method: "POST", headers, body: JSON.stringify({ query: { filter: { title: { $eq: packageData.article.title } }, paging: { limit: 10 } }, fieldsets: ["RICH_CONTENT", "URL"] }) }, timeoutMs);
    const matches = (query.draftPosts || []).filter((item) => item.id === DRAFT_ID || item.seoSlug === packageData.article.slug);
    if (matches.length !== 1 || matches[0].id !== DRAFT_ID) throw new Error("FIRST_PUBLICATION_DUPLICATE_OR_IDENTITY_CONFLICT");
    await verifyDraft(matches[0], { stage: "pre_update", expectedId: DRAFT_ID, requireExactContent: false });
    record = await ledger.transition(record.version, "preflight_verified", { duplicateCount: matches.length });

    record = await ledger.transition(record.version, "image_upload_started", { requestCounts: { ...record.requestCounts, imageUrl: 1, imageUpload: 1 } });
    const image = await uploadVerifiedImage({ fetchImpl, credential: session.credential, siteId: SITE_ID, bytes: imageBytes, fileName: packageData.image.fileName, mimeType: "image/jpeg", timeoutMs });
    record = await ledger.transition(record.version, "image_uploaded", { wixImageFileId: image.fileId, wixImageUrl: image.mediaUrl });

    const payload = buildWixDraftPayload(packageData.article, { sourceUrl: image.mediaUrl });
    payload.payload.draftPost.id = DRAFT_ID;
    record = await ledger.transition(record.version, "draft_update_started", { requestCounts: { ...record.requestCounts, draftUpdate: 1 }, transportChecksum: sha256(payload.payload.draftPost) });
    const updated = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}`, { method: "PATCH", headers, body: JSON.stringify({ draftPost: payload.payload.draftPost, action: "UPDATE", fieldsets: ["RICH_CONTENT", "URL"] }) }, timeoutMs);
    if (updated.draftPost?.id !== DRAFT_ID) throw new Error("FIRST_PUBLICATION_UPDATE_RESPONSE_UNCERTAIN");
    record = await ledger.transition(record.version, "draft_updated", { wixDraftId: DRAFT_ID });

    const retrieved = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}?fieldsets=RICH_CONTENT&fieldsets=URL`, { method: "GET", headers }, timeoutMs);
    const draftVerification = await verifyDraft(retrieved.draftPost, { stage: "post_update", expectedId: DRAFT_ID, expectedPayload: payload.payload.draftPost, expectedImage: image });
    if (!draftVerification?.verified) throw new Error("FIRST_PUBLICATION_DRAFT_VERIFICATION_FAILED");
    record = await ledger.transition(record.version, "draft_verified", { draftVerification });

    record = await ledger.transition(record.version, "publish_started", { requestCounts: { ...record.requestCounts, publish: 1 } });
    const published = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}/publish`, { method: "POST", headers, body: "{}" }, timeoutMs);
    if (!published.postId) throw new Error("FIRST_PUBLICATION_PUBLISH_RESPONSE_UNCERTAIN");
    record = await ledger.transition(record.version, "published", { wixPostId: published.postId });
    const publicVerification = await verifyPublic({ postId: published.postId, expectedUrl: packageData.article.expectedPublicUrl, image });
    if (!publicVerification?.verified) throw new Error("FIRST_PUBLICATION_PUBLIC_VERIFICATION_FAILED");
    record = await ledger.transition(record.version, "public_verified", { publicUrl: publicVerification.url, publicVerification });
    return { status: "public_verified", publicUrl: record.publicUrl, wixPostId: record.wixPostId, requestCounts: record.requestCounts, replayBlocked: false };
  } catch (error) {
    const beforeWrite = ["reserved", "preflight_verified"].includes(record?.state);
    if (record && !terminalStates.has(record.state)) {
      try { record = await ledger.transition(record.version, beforeWrite ? "failed_before_write" : "quarantined", { failureCode: classify(error), uncertain: !beforeWrite }); } catch { /* durable prior state still blocks replay */ }
    }
    throw error;
  } finally {
    if (session) {
      await credentialSession.revoke(session);
      const revoked = await credentialSession.isRevoked(session);
      const current = await ledger.get();
      if (current) await ledger.transition(current.version, current.state, { credentialRevoked: revoked, credentialRevocationVerifiedAt: revoked ? new Date().toISOString() : null });
      if (!revoked) throw new Error("FIRST_PUBLICATION_CREDENTIAL_REVOCATION_UNVERIFIED");
    }
  }
}

function validatePreflight({ packageData, authorization, ledger, credentialSession, imageBytes, verifyDraft, verifyPublic, killSwitch, hashBytes }) {
  if (!ledger || !credentialSession || !imageBytes || !verifyDraft || !verifyPublic) throw new Error("FIRST_PUBLICATION_DEPENDENCIES_REQUIRED");
  if (killSwitch) throw new Error("FIRST_PUBLICATION_KILL_SWITCH_ACTIVE");
  if (packageData?.publicationFingerprint !== PUBLISH_FINGERPRINT || packageData?.wix?.existingHistoricalDraftId !== DRAFT_ID || packageData?.wix?.siteId !== SITE_ID) throw new Error("FIRST_PUBLICATION_PACKAGE_MISMATCH");
  if (hashBytes(imageBytes) !== packageData.image.checksum) throw new Error("FIRST_PUBLICATION_IMAGE_CHECKSUM_MISMATCH");
  if (authorization?.scope !== FIRST_PUBLICATION_SCOPE || authorization.publicationFingerprint !== PUBLISH_FINGERPRINT || authorization.siteId !== SITE_ID || authorization.draftId !== DRAFT_ID) throw new Error("FIRST_PUBLICATION_AUTHORIZATION_MISMATCH");
  if (!authorization.imageUploadAuthorized || !authorization.draftUpdateAuthorized || !authorization.publicationAuthorized) throw new Error("FIRST_PUBLICATION_EXACT_APPROVAL_REQUIRED");
}

async function requestJson(fetchImpl, url, options, timeoutMs) {
  assertEndpoint(url, options.method);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetchImpl(url, { ...options, signal: controller.signal }); if (!response.ok) throw new Error(`FIRST_PUBLICATION_WIX_HTTP_${response.status}`); return response.json(); } finally { clearTimeout(timer); }
}

export function assertEndpoint(url, method) {
  const parsed = new URL(url); const verb = String(method).toUpperCase(); const path = parsed.pathname;
  const allowed = parsed.origin === "https://www.wixapis.com" && (
    (verb === "POST" && path === "/blog/v3/draft-posts/query") ||
    (verb === "GET" && path === `/blog/v3/draft-posts/${DRAFT_ID}`) ||
    (verb === "PATCH" && path === `/blog/v3/draft-posts/${DRAFT_ID}`) ||
    (verb === "POST" && path === `/blog/v3/draft-posts/${DRAFT_ID}/publish`)
  );
  if (!allowed) throw new Error("FIRST_PUBLICATION_ENDPOINT_NOT_ALLOWED");
  return true;
}

function replay(record) { return { status: record?.state || "unknown", replayBlocked: true, requestCounts: { imageUrl: 0, imageUpload: 0, draftUpdate: 0, publish: 0 }, publicUrl: record?.publicUrl || null }; }
function classify(error) { const value = String(error?.message || "unknown"); if (/timeout|abort/i.test(value)) return "timeout_uncertain"; if (/HTTP/.test(value)) return "wix_http_failure"; return value.slice(0, 120); }
function writePayload(name, payload, precondition) { return { update: { name, fields: { payloadJson: { stringValue: JSON.stringify(payload) }, checksum: { stringValue: sha256(payload) } } }, currentDocument: precondition }; }
