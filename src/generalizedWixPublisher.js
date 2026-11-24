import { buildWixDraftPayload } from "./wixDrafts.js";
import { verifyRetrievedDraft } from "./wixOneShotExecutor.js";
import { uploadVerifiedImage } from "./wixMedia.js";
import { evaluatePublicationWindow } from "./blogAutopilotPolicy.js";
import { verifyPublicArticle } from "./publicPageVerification.js";

const SITE_ID = "fe9762c6-cdbd-404c-ba42-c2b834b052e2";

async function json(fetchImpl, url, options, timeoutMs = 20_000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetchImpl(url, { ...options, signal: controller.signal }); if (!response.ok) throw new Error(`WIX_AUTOPILOT_HTTP_${response.status}`); return response.json(); } finally { clearTimeout(timer); }
}

export async function executeGeneralizedWixPublication({ candidate, draft, image, imageBytes, credential, ledger, now = new Date(), monthlyRecords = [], slotRecords = [], killSwitch = true, fetchImpl = fetch, publicVerifier = verifyPublicArticle } = {}) {
  if (killSwitch) return { status: "completed_no_publication", reason: "kill_switch_active", writesToWix: 0 };
  const window = evaluatePublicationWindow({ instant: now, killSwitch, monthlyRecords, slotRecords });
  if (!window.allowed) return { status: "completed_no_publication", reason: window.reason, writesToWix: 0 };
  if (!candidate?.contentFingerprint || !draft?.validation?.valid || !imageBytes || !credential || !ledger) throw new Error("WIX_AUTOPILOT_PREFLIGHT_FAILED");
  const reservation = await ledger.reserve({ monthKey: window.slot.monthKey, slotKey: window.slot.key, articleId: candidate.stableArticleId, contentFingerprint: candidate.contentFingerprint, exploratory: candidate.evidenceCategory === "evidence_backed_exploratory_opportunity" });
  if (!reservation.created) return { status: reservation.record?.state || "replay_blocked", reason: "existing_reservation", writesToWix: 0 };
  let record = reservation.record; const headers = { authorization: credential, "wix-site-id": SITE_ID, "content-type": "application/json" };
  try {
    const query = await json(fetchImpl, "https://www.wixapis.com/blog/v3/draft-posts/query", { method: "POST", headers, body: JSON.stringify({ query: { filter: { seoSlug: { $eq: draft.slug } }, paging: { limit: 10 } }, fieldsets: ["RICH_CONTENT", "URL"] }) });
    if ((query.draftPosts || []).length) throw new Error("WIX_AUTOPILOT_DUPLICATE_DRAFT");
    record = await ledger.transition(record.version, "image_request_started", { id: record.id, requestCounts: { image: 1, draft: 0, publish: 0 } });
    const uploaded = await uploadVerifiedImage({ fetchImpl, credential, siteId: SITE_ID, bytes: imageBytes, fileName: image.fileName, mimeType: image.mimeType });
    const wix = buildWixDraftPayload(draft, { sourceUrl: uploaded.mediaUrl });
    record = await ledger.transition(record.version, "draft_request_started", { id: record.id, requestCounts: { image: 1, draft: 1, publish: 0 }, wixImageFileId: uploaded.fileId });
    const created = await json(fetchImpl, "https://www.wixapis.com/blog/v3/draft-posts", { method: "POST", headers, body: JSON.stringify({ ...wix.payload, publish: false }) });
    if (!created.draftPost?.id) throw new Error("WIX_AUTOPILOT_DRAFT_RESPONSE_UNCERTAIN");
    record = await ledger.transition(record.version, "draft_created", { id: record.id, wixDraftId: created.draftPost.id });
    const retrieved = await json(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${encodeURIComponent(record.wixDraftId)}?fieldsets=RICH_CONTENT&fieldsets=URL`, { method: "GET", headers });
    const verification = verifyRetrievedDraft(retrieved.draftPost, wix.payload.draftPost, record.wixDraftId, SITE_ID);
    record = await ledger.transition(record.version, "draft_verified", { id: record.id, draftVerification: verification });
    record = await ledger.transition(record.version, "publication_request_started", { id: record.id, requestCounts: { image: 1, draft: 1, publish: 1 } });
    const published = await json(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${encodeURIComponent(record.wixDraftId)}/publish`, { method: "POST", headers, body: "{}" });
    if (!published.postId) throw new Error("WIX_AUTOPILOT_PUBLISH_RESPONSE_UNCERTAIN");
    record = await ledger.transition(record.version, "published", { id: record.id, wixPostId: published.postId });
    const expectedUrl = `https://www.djelvio.nl/post/${draft.slug}`;
    let publicVerification = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { publicVerification = await publicVerifier({ url: expectedUrl, expected: { seoTitle: draft.seoTitle || draft.title, canonicalUrl: expectedUrl, h1: draft.title, h1Count: 1, ctaUrl: "https://www.djelvio.nl/contact", imageIdentity: uploaded.fileId } }); if (publicVerification.verified) break; } catch (error) { if (attempt === 4) throw error; await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1))); }
    }
    record = await ledger.transition(record.version, "publicly_verified", { id: record.id, publicUrl: expectedUrl, publicVerification });
    return { status: "published_verified", publicUrl: expectedUrl, wixPostId: published.postId, writesToWix: 3, slot: window.slot };
  } catch (error) {
    if (record && !["publicly_verified", "quarantined"].includes(record.state)) {
      try { await ledger.transition(record.version, "quarantined", { id: record.id, incidentCode: String(error.message || "unknown").slice(0, 120), uncertain: !["reserved"].includes(record.state) }); } catch { /* existing reservation still blocks replay */ }
    }
    throw error;
  }
}

