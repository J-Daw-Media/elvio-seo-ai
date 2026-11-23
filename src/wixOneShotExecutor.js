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
      const retrieved = await this.request(`${wixPhase2Contract.draftEndpoint}/${encodeURIComponent(record.wixDraftId)}?fieldsets=RICH_CONTENT`, "GET", session.credential, siteId);
      const verification = verifyRetrievedDraft(retrieved?.draftPost, wixDryRun.payload.draftPost, record.wixDraftId, siteId);
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
      const retrieved = await this.request(`${wixPhase2Contract.draftEndpoint}/${encodeURIComponent(wixDraftId)}?fieldsets=RICH_CONTENT`, "GET", session.credential, siteId);
      const verification = verifyRetrievedDraft(retrieved?.draftPost, wixDryRun.payload.draftPost, wixDraftId, siteId);
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
  if (wixDryRun.payload?.draftPost?.memberId !== wixPhase2Contract.memberId) throw new Error("WIX_WRITER_IDENTITY_MISMATCH");
  if (!wixDryRun.payload?.draftPost?.seoSlug || wixDryRun.payload?.draftPost?.slug) throw new Error("WIX_SEO_SLUG_CONTRACT_INVALID");
  assertWixEndpointAllowed(wixDryRun.endpoint, "POST");
}

export function normalizeWixDraft(draft = {}) {
  const tags = Array.isArray(draft.seoData?.tags) ? draft.seoData.tags : [];
  const seoTitle = tags.find((tag) => tag.type === "title")?.children ?? null;
  const seoDescription = tags.find((tag) => tag.type === "meta" && tag.props?.name === "description")?.props?.content ?? null;
  const nodes = (draft.richContent?.nodes || []).map((node) => ({
    type: node.type,
    level: node.headingData?.level ?? null,
    parts: (node.nodes || []).map((part) => ({ text: part.textData?.text || "", links: (part.textData?.decorations || []).filter((item) => item.type === "LINK").map((item) => item.linkData?.link?.url).filter(Boolean) })),
  }));
  const headings = nodes.filter((node) => node.type === "HEADING").map((node) => `${node.level}:${node.parts.map((part) => part.text).join("")}`);
  const paragraphs = nodes.filter((node) => node.type === "PARAGRAPH").map((node) => node.parts.map((part) => part.text).join(""));
  const links = nodes.flatMap((node) => node.parts.flatMap((part) => part.links));
  const seoSlug = draft.seoSlug ?? draft.slug ?? null;
  const canonicalContent = { title: draft.title ?? null, seoSlug, excerpt: draft.excerpt ?? null, seoTitle, seoDescription, nodes };
  return {
    id: draft.id ?? null, siteId: draft.siteId ?? null, memberId: draft.memberId ?? null, title: draft.title ?? null, seoSlug, excerpt: draft.excerpt ?? null,
    seoTitle, seoDescription, nodes, headings, paragraphs, links,
    contentChecksum: sha256(canonicalContent), imageIdentity: draft.media?.wixMedia?.image || null,
    status: draft.status ?? null, publishedDate: draft.publishedDate ?? null,
  };
}

export function verifyRetrievedDraft(actual, expected, expectedId, expectedSiteId = approvedGate4Candidate.siteId) {
  if (!actual || actual.id !== expectedId) throw new Error("WIX_RETRIEVED_DRAFT_ID_MISMATCH");
  const normalizedActual = normalizeWixDraft(actual);
  const normalizedExpected = normalizeWixDraft(expected);
  const status = String(actual.status || "").toUpperCase();
  if (actual.publishedDate || status && !["DRAFT", "UNPUBLISHED"].includes(status)) throw new Error("WIX_RETRIEVED_DRAFT_PUBLISHED");
  for (const field of ["title", "seoSlug", "excerpt", "seoTitle", "seoDescription", "contentChecksum", "imageIdentity", "memberId"]) {
    if (normalizedActual[field] !== normalizedExpected[field]) throw new Error(`WIX_RETRIEVED_${field.toUpperCase()}_MISMATCH`);
  }
  for (const field of ["headings", "paragraphs", "links", "nodes"]) {
    if (JSON.stringify(normalizedActual[field]) !== JSON.stringify(normalizedExpected[field])) throw new Error(`WIX_RETRIEVED_${field.toUpperCase()}_MISMATCH`);
  }
  const cta = "https://www.djelvio.nl/contact";
  if (!normalizedActual.links.includes(cta)) throw new Error("WIX_RETRIEVED_CTA_MISMATCH");
  if (normalizedActual.siteId && normalizedActual.siteId !== expectedSiteId) throw new Error("WIX_RETRIEVED_SITE_ID_MISMATCH");
  const unverifiableFields = [];
  if (!normalizedActual.siteId) unverifiableFields.push("wix_site_identity_response_field");
  return {
    unpublished: true, title: true, seoSlug: true, seoTitle: true, seoDescription: true, completeBody: true,
    headings: true, paragraphs: true, internalLinks: true, cta: true, imageIdentity: true,
    expectedContentChecksum: normalizedExpected.contentChecksum, retrievedContentChecksum: normalizedActual.contentChecksum,
    requestBoundSiteIdentity: expectedSiteId, unverifiableFields,
  };
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

