import { createHash } from "node:crypto";
import { buildWixDraftPayload } from "./wixDrafts.js";

const DRAFT_ID = "cf13a806-22ee-43c2-bb29-c362132bf325";
const SITE_ID = "fe9762c6-cdbd-404c-ba42-c2b834b052e2";
const FINGERPRINT = "60fe00f6f7262243b9e64200f66747ab4c6c818a6a8b9c1c06c856560726b765";

export async function recoverFirstPublication({ packageData, authorization, originalLedger, recoveryLedger, credential, fetchImpl = fetch, verifyDraft, verifyPublic, timeoutMs = 15000 } = {}) {
  validate({ packageData, authorization, originalLedger, recoveryLedger, credential, verifyDraft, verifyPublic });
  const original = await originalLedger.get();
  if (original?.state !== "quarantined" || original.failureCode !== "WIX_MEDIA_VERIFICATION_FAILED" || original.requestCounts?.imageUpload !== 1 || original.requestCounts?.draftUpdate !== 0 || original.requestCounts?.publish !== 0 || original.credentialRevoked !== true) throw new Error("FIRST_PUBLICATION_RECOVERY_PARENT_MISMATCH");
  const reservation = await recoveryLedger.reserve({
    authorizationId: authorization.authorizationId,
    attemptId: authorization.attemptId,
    parentAttemptId: original.attemptId,
    publicationFingerprint: FINGERPRINT,
    siteId: SITE_ID,
    draftId: DRAFT_ID,
  });
  if (!reservation.created) return { status: reservation.record.state, replayBlocked: true, requestCounts: zeroCounts(), publicUrl: reservation.record.publicUrl || null };
  let record = reservation.record;
  const headers = { authorization: credential, "wix-site-id": SITE_ID, "content-type": "application/json" };
  try {
    const media = await requestJson(fetchImpl, "https://www.wixapis.com/site-media/v1/files/search", { method: "POST", headers, body: JSON.stringify({ search: packageData.image.fileName, mediaTypes: ["IMAGE"], paging: { limit: 20 } }) }, timeoutMs);
    const exact = (media.files || []).filter((file) => file.displayName === packageData.image.fileName && String(file.operationStatus || file.state || "").toUpperCase() === "READY" && file.mediaType === "IMAGE");
    if (exact.length !== 1 || !exact[0].id || !exact[0].url) throw new Error("FIRST_PUBLICATION_RECOVERY_IMAGE_CONFLICT");
    const imageResponse = await timed(fetchImpl, exact[0].url, { method: "GET" }, timeoutMs);
    if (!imageResponse.ok) throw new Error(`FIRST_PUBLICATION_RECOVERY_IMAGE_HTTP_${imageResponse.status}`);
    const imageChecksum = createHash("sha256").update(Buffer.from(await imageResponse.arrayBuffer())).digest("hex");
    if (imageChecksum !== packageData.image.checksum) throw new Error("FIRST_PUBLICATION_RECOVERY_IMAGE_CHECKSUM_MISMATCH");

    const query = await requestJson(fetchImpl, "https://www.wixapis.com/blog/v3/draft-posts/query", { method: "POST", headers, body: JSON.stringify({ query: { filter: { title: { $eq: packageData.article.title } }, paging: { limit: 10 } }, fieldsets: ["RICH_CONTENT", "URL"] }) }, timeoutMs);
    const matches = (query.draftPosts || []).filter((item) => item.id === DRAFT_ID || item.seoSlug === packageData.article.slug);
    if (matches.length !== 1 || matches[0].id !== DRAFT_ID) throw new Error("FIRST_PUBLICATION_RECOVERY_DRAFT_CONFLICT");
    const preflight = await verifyDraft(matches[0], { stage: "pre_update", expectedId: DRAFT_ID, requireExactContent: false });
    if (!preflight?.verified) throw new Error("FIRST_PUBLICATION_RECOVERY_DRAFT_NOT_UNPUBLISHED");
    record = await recoveryLedger.transition(record.version, "preflight_verified", { wixImageFileId: exact[0].id, wixImageUrl: exact[0].url, imageChecksum, requestCounts: { ...zeroCounts(), mediaSearch: 1, imageDownload: 1, draftQuery: 1 } });

    const payload = buildWixDraftPayload(packageData.article, { sourceUrl: exact[0].url });
    payload.payload.draftPost.id = DRAFT_ID;
    record = await recoveryLedger.transition(record.version, "draft_update_started", { requestCounts: { ...record.requestCounts, draftUpdate: 1 } });
    const updated = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}`, { method: "PATCH", headers, body: JSON.stringify({ draftPost: payload.payload.draftPost, action: "UPDATE", fieldsets: ["RICH_CONTENT", "URL"] }) }, timeoutMs);
    if (updated.draftPost?.id !== DRAFT_ID) throw new Error("FIRST_PUBLICATION_RECOVERY_UPDATE_UNCERTAIN");
    record = await recoveryLedger.transition(record.version, "draft_updated", { wixDraftId: DRAFT_ID });

    const retrieved = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}?fieldsets=RICH_CONTENT&fieldsets=URL`, { method: "GET", headers }, timeoutMs);
    const draftVerification = await verifyDraft(retrieved.draftPost, { stage: "post_update", expectedId: DRAFT_ID, expectedPayload: payload.payload.draftPost, expectedImage: exact[0] });
    if (!draftVerification?.verified) throw new Error("FIRST_PUBLICATION_RECOVERY_DRAFT_VERIFICATION_FAILED");
    record = await recoveryLedger.transition(record.version, "draft_verified", { draftVerification });

    record = await recoveryLedger.transition(record.version, "publish_started", { requestCounts: { ...record.requestCounts, publish: 1 } });
    const published = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}/publish`, { method: "POST", headers, body: "{}" }, timeoutMs);
    if (!published.postId) throw new Error("FIRST_PUBLICATION_RECOVERY_PUBLISH_UNCERTAIN");
    record = await recoveryLedger.transition(record.version, "published", { wixPostId: published.postId });
    const publicVerification = await verifyPublic({ postId: published.postId, expectedUrl: packageData.article.expectedPublicUrl, image: exact[0] });
    if (!publicVerification?.verified) throw new Error("FIRST_PUBLICATION_RECOVERY_PUBLIC_VERIFICATION_FAILED");
    record = await recoveryLedger.transition(record.version, "public_verified", { publicUrl: publicVerification.url, publicVerification });
    return { status: "public_verified", publicUrl: record.publicUrl, wixPostId: record.wixPostId, replayBlocked: false, requestCounts: record.requestCounts };
  } catch (error) {
    const beforeWrite = ["reserved", "preflight_verified"].includes(record.state);
    await recoveryLedger.transition(record.version, beforeWrite ? "failed_before_write" : "quarantined", { failureCode: String(error.message).slice(0, 160), uncertain: !beforeWrite });
    throw error;
  }
}

function validate({ packageData, authorization, originalLedger, recoveryLedger, credential, verifyDraft, verifyPublic }) {
  if (!originalLedger || !recoveryLedger || !credential || !verifyDraft || !verifyPublic) throw new Error("FIRST_PUBLICATION_RECOVERY_DEPENDENCIES_REQUIRED");
  if (packageData?.publicationFingerprint !== FINGERPRINT || packageData?.wix?.siteId !== SITE_ID || packageData?.wix?.existingHistoricalDraftId !== DRAFT_ID) throw new Error("FIRST_PUBLICATION_RECOVERY_PACKAGE_MISMATCH");
  if (authorization?.scope !== "wix_first_publication_once" || authorization.publicationFingerprint !== FINGERPRINT || authorization.siteId !== SITE_ID || authorization.draftId !== DRAFT_ID || !authorization.publicationAuthorized) throw new Error("FIRST_PUBLICATION_RECOVERY_AUTHORIZATION_MISMATCH");
}

function zeroCounts() { return { mediaSearch: 0, imageDownload: 0, draftQuery: 0, draftUpdate: 0, publish: 0 }; }
async function requestJson(fetchImpl, url, options, timeoutMs) { const response = await timed(fetchImpl, url, options, timeoutMs); if (!response.ok) throw new Error(`FIRST_PUBLICATION_RECOVERY_WIX_HTTP_${response.status}`); return response.json(); }
async function timed(fetchImpl, url, options, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetchImpl(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }
