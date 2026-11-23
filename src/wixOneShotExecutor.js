import { sha256 } from "./identity.js";
import { assertWixEndpointAllowed, wixPhase2Contract } from "./wixDrafts.js";
import { sanitizeExecutionRecord } from "./wixExecutionLedger.js";

export const approvedGate4Candidate = Object.freeze({
  fingerprint: "baa01871c1ae417b7306686a2aa015c2783438da6805deadc177c435eb2e0bf7",
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
});

export class WixOneShotExecutor {
  constructor({ ledger, credentialSession, fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 15000 } = {}) {
    if (!ledger || !credentialSession) throw new Error("WIX_EXECUTOR_DEPENDENCIES_REQUIRED");
    this.ledger = ledger; this.credentialSession = credentialSession; this.fetch = fetchImpl; this.now = now; this.timeoutMs = timeoutMs;
  }

  async execute({ review, wixDryRun, approvedFingerprint, siteId } = {}) {
    verifyCandidate({ review, wixDryRun, approvedFingerprint, siteId });
    const fingerprint = approvedFingerprint;
    const reservation = await this.ledger.reserve({ fingerprint, reviewId: review.id, siteId, payloadChecksum: sha256(wixDryRun.payload), publicationAuthorized: false });
    if (!reservation.created) return replayResult(reservation.record);

    let record = reservation.record;
    let session;
    try {
      session = await this.credentialSession.acquire();
      if (!session?.credential || session.siteId !== siteId) {
        record = await this.ledger.transition(fingerprint, record.version, "failed_before_request", { failureCode: "credential_or_site_mismatch" });
        throw new Error("WIX_CREDENTIAL_SITE_MISMATCH");
      }
      record = await this.ledger.transition(fingerprint, record.version, "request_started", { requestStartedAt: this.now(), createRequestCount: 1 });
      const create = await this.request(wixPhase2Contract.draftEndpoint, "POST", session.credential, siteId, wixDryRun.payload);
      if (!create?.draftPost?.id) throw new Error("WIX_CREATE_RESPONSE_UNCERTAIN");
      record = await this.ledger.transition(fingerprint, record.version, "created", { wixDraftId: create.draftPost.id, createResponseStatus: create.responseStatus || 200 });
      const retrieved = await this.request(`${wixPhase2Contract.draftEndpoint}/${encodeURIComponent(record.wixDraftId)}`, "GET", session.credential, siteId);
      const verification = verifyRetrievedDraft(retrieved?.draftPost, wixDryRun.payload.draftPost, record.wixDraftId);
      record = await this.ledger.transition(fingerprint, record.version, "verified", { verifiedAt: this.now(), verification, receipt: redactedReceipt(record, verification) });
      return { status: "verified", postRequests: 1, wixDraftId: record.wixDraftId, receipt: record.receipt };
    } catch (error) {
      if (record?.state === "reserved") {
        try { record = await this.ledger.transition(fingerprint, record.version, "failed_before_request", { failureCode: classifyFailure(error) }); } catch { /* reservation still blocks replay */ }
      } else if (record?.state === "request_started") {
        try { record = await this.ledger.transition(fingerprint, record.version, "uncertain", { failureCode: classifyFailure(error), quarantined: true }); } catch { /* reservation still blocks replay */ }
      } else if (record?.state === "created") {
        try { record = await this.ledger.transition(fingerprint, record.version, "uncertain", { failureCode: classifyFailure(error), quarantined: true, wixDraftId: record.wixDraftId }); } catch { /* created ID remains in durable record */ }
      }
      throw error;
    } finally {
      if (session) {
        await this.credentialSession.revoke(session);
        if (!(await this.credentialSession.isRevoked(session))) throw new Error("WIX_CREDENTIAL_REVOCATION_UNVERIFIED");
      }
    }
  }

  async reconcile({ review, wixDryRun, approvedFingerprint, siteId, wixDraftId } = {}) {
    verifyCandidate({ review, wixDryRun, approvedFingerprint, siteId });
    if (!/^[a-z0-9-]{1,64}$/i.test(String(wixDraftId || ""))) throw new Error("WIX_RECONCILIATION_EXACT_ID_REQUIRED");
    let record = await this.ledger.get(approvedFingerprint);
    if (!record || !["request_started", "uncertain", "created"].includes(record.state)) throw new Error("WIX_RECONCILIATION_STATE_INVALID");
    if (record.wixDraftId && record.wixDraftId !== wixDraftId) throw new Error("WIX_RECONCILIATION_ID_CONFLICT");
    let session;
    try {
      session = await this.credentialSession.acquire();
      if (!session?.credential || session.siteId !== siteId) throw new Error("WIX_CREDENTIAL_SITE_MISMATCH");
      const retrieved = await this.request(`${wixPhase2Contract.draftEndpoint}/${encodeURIComponent(wixDraftId)}`, "GET", session.credential, siteId);
      const verification = verifyRetrievedDraft(retrieved?.draftPost, wixDryRun.payload.draftPost, wixDraftId);
      record = await this.ledger.transition(approvedFingerprint, record.version, "verified", { wixDraftId, verifiedAt: this.now(), verification, reconciledWithoutCreate: true, receipt: redactedReceipt({ ...record, wixDraftId }, verification) });
      return { status: "verified", reconciled: true, postRequests: 0, wixDraftId, receipt: record.receipt };
    } finally {
      if (session) {
        await this.credentialSession.revoke(session);
        if (!(await this.credentialSession.isRevoked(session))) throw new Error("WIX_CREDENTIAL_REVOCATION_UNVERIFIED");
      }
    }
  }

  async request(url, method, credential, siteId, body) {
    assertWixEndpointAllowed(url, method);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(url, { method, headers: { authorization: credential, "wix-site-id": siteId, "content-type": "application/json" }, ...(body ? { body: JSON.stringify({ ...body, publish: false }) } : {}), signal: controller.signal });
      if (!response.ok) throw new Error(`WIX_HTTP_${response.status}`);
      return { ...(await response.json()), responseStatus: response.status };
    } finally { clearTimeout(timer); }
  }
}

function verifyCandidate({ review, wixDryRun, approvedFingerprint, siteId }) {
  if (approvedFingerprint !== approvedGate4Candidate.fingerprint || review?.contentFingerprint !== approvedFingerprint || wixDryRun?.contentFingerprint !== approvedFingerprint) throw new Error("WIX_APPROVED_FINGERPRINT_MISMATCH");
  if (siteId !== approvedGate4Candidate.siteId || wixDryRun?.siteId !== siteId) throw new Error("WIX_SITE_ID_MISMATCH");
  if (review.state !== "approved_for_draft_creation" || review.publicationAuthorized) throw new Error("WIX_DRAFT_APPROVAL_REQUIRED");
  if (wixDryRun.payload?.publish !== false || wixDryRun.payload?.draftPost?.media) throw new Error("WIX_DRAFT_PAYLOAD_NOT_APPROVED");
  assertWixEndpointAllowed(wixDryRun.endpoint, "POST");
}

function verifyRetrievedDraft(actual, expected, expectedId) {
  if (!actual || actual.id !== expectedId) throw new Error("WIX_RETRIEVED_DRAFT_ID_MISMATCH");
  if (actual.title !== expected.title || actual.slug !== expected.slug || actual.excerpt !== expected.excerpt) throw new Error("WIX_RETRIEVED_CONTENT_MISMATCH");
  if (actual.publishedDate || actual.status && String(actual.status).toUpperCase() !== "DRAFT") throw new Error("WIX_RETRIEVED_DRAFT_PUBLISHED");
  const expectedHeadings = expected.richContent?.nodes?.filter((node) => node.type === "HEADING").map((node) => `${node.headingData?.level}:${node.nodes?.map((item) => item.textData?.text || "").join("")}`);
  const actualHeadings = actual.richContent?.nodes?.filter((node) => node.type === "HEADING").map((node) => `${node.headingData?.level}:${node.nodes?.map((item) => item.textData?.text || "").join("")}`);
  if (JSON.stringify(actualHeadings) !== JSON.stringify(expectedHeadings)) throw new Error("WIX_RETRIEVED_HEADINGS_MISMATCH");
  if (actual.media?.wixMedia?.image) throw new Error("WIX_RETRIEVED_IMAGE_UNEXPECTED");
  return { unpublished: true, title: true, slug: true, excerpt: true, headings: true, imageFree: true };
}

function replayResult(record) {
  return { status: record?.state || "unknown", replayBlocked: true, postRequests: 0, wixDraftId: record?.wixDraftId || null, quarantined: ["request_started", "uncertain"].includes(record?.state) };
}

function classifyFailure(error) {
  const message = String(error?.message || "unknown");
  if (/abort|timeout/i.test(message)) return "request_timeout";
  if (/RETRIEVED/.test(message)) return "retrieval_or_verification_failed";
  if (/HTTP/.test(message)) return "wix_http_failure";
  return "create_outcome_uncertain";
}

function redactedReceipt(record, verification) {
  return sanitizeExecutionRecord({ fingerprint: record.fingerprint, reviewId: record.reviewId, siteId: record.siteId, wixDraftId: record.wixDraftId, state: "verified", verifiedAt: new Date().toISOString(), createRequestCount: 1, publicationAuthorized: false, verification });
}

