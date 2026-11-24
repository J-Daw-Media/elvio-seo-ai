import { sha256 } from "./identity.js";
import { buildWixDraftPayload } from "./wixDrafts.js";

const DRAFT_ID = "cf13a806-22ee-43c2-bb29-c362132bf325";
const SITE_ID = "fe9762c6-cdbd-404c-ba42-c2b834b052e2";

export function buildFirstPublicationSeoCorrection(packageData, image) {
  if (!packageData?.article?.seoTitle || !image?.id || !image?.url) throw new Error("SEO_CORRECTION_INPUT_REQUIRED");
  const draft = buildWixDraftPayload(packageData.article, null).payload.draftPost;
  const nodes = draft.richContent.nodes;
  if (nodes[0]?.type !== "HEADING" || nodes[0]?.headingData?.level !== 1) throw new Error("SEO_CORRECTION_SOURCE_H1_MISSING");
  draft.id = DRAFT_ID;
  draft.richContent = { nodes: nodes.slice(1) };
  draft.seoData.tags = draft.seoData.tags.map((tag) => tag.type === "title" ? { ...tag, children: packageData.article.seoTitle } : tag);
  draft.media = { wixMedia: { image: { id: image.id, url: image.url } }, displayed: true, custom: true, altText: packageData.image.altText };
  const correctionFingerprint = sha256({ sourcePublicationFingerprint: packageData.publicationFingerprint, draft });
  return { correctionFingerprint, draft, expected: { seoTitle: packageData.article.seoTitle, h1: packageData.article.h1, h1Count: 1, canonicalUrl: packageData.article.expectedPublicUrl, ctaUrl: "https://www.djelvio.nl/contact", imageIdentity: image.id } };
}

export async function executeFirstPublicationSeoCorrection({ packageData, image, ledger, credential, fetchImpl = fetch, verifyPublic, timeoutMs = 15000 } = {}) {
  if (!ledger || !credential || !verifyPublic) throw new Error("SEO_CORRECTION_DEPENDENCIES_REQUIRED");
  const plan = buildFirstPublicationSeoCorrection(packageData, image);
  const reservation = await ledger.reserve({ correctionFingerprint: plan.correctionFingerprint, publicationFingerprint: packageData.publicationFingerprint, siteId: SITE_ID, draftId: DRAFT_ID });
  if (!reservation.created) return { status: reservation.record.state, replayBlocked: true, requestCounts: zeroCounts(), publicUrl: reservation.record.publicUrl || null };
  let record = reservation.record;
  const headers = { authorization: credential, "wix-site-id": SITE_ID, "content-type": "application/json" };
  try {
    const current = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}?fieldsets=RICH_CONTENT&fieldsets=URL`, { method: "GET", headers }, timeoutMs);
    const currentImage = current.draftPost?.media?.wixMedia?.image;
    if (current.draftPost?.id !== DRAFT_ID || current.draftPost?.status !== "PUBLISHED" || (currentImage?.id || currentImage) !== image.id) throw new Error("SEO_CORRECTION_PREFLIGHT_MISMATCH");
    record = await ledger.transition(record.version, "preflight_verified", { requestCounts: { ...zeroCounts(), draftGet: 1 } });

    record = await ledger.transition(record.version, "draft_update_started", { requestCounts: { ...record.requestCounts, draftUpdate: 1 } });
    const updated = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}`, { method: "PATCH", headers, body: JSON.stringify({ draftPost: plan.draft, action: "UPDATE", fieldsets: ["RICH_CONTENT", "URL"] }) }, timeoutMs);
    if (updated.draftPost?.id !== DRAFT_ID) throw new Error("SEO_CORRECTION_UPDATE_UNCERTAIN");
    record = await ledger.transition(record.version, "draft_updated", {});

    const retrieved = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}?fieldsets=RICH_CONTENT&fieldsets=URL`, { method: "GET", headers }, timeoutMs);
    const titleTag = retrieved.draftPost?.seoData?.tags?.find((tag) => tag.type === "title")?.children;
    const bodyH1s = (retrieved.draftPost?.richContent?.nodes || []).filter((node) => node.type === "HEADING" && node.headingData?.level === 1);
    const retrievedImage = retrieved.draftPost?.media?.wixMedia?.image;
    if (titleTag !== plan.expected.seoTitle || bodyH1s.length !== 0 || (retrievedImage?.id || retrievedImage) !== image.id) throw new Error("SEO_CORRECTION_DRAFT_VERIFICATION_FAILED");
    record = await ledger.transition(record.version, "draft_verified", { requestCounts: { ...record.requestCounts, draftVerify: 1 } });

    record = await ledger.transition(record.version, "publish_started", { requestCounts: { ...record.requestCounts, publish: 1 } });
    const published = await requestJson(fetchImpl, `https://www.wixapis.com/blog/v3/draft-posts/${DRAFT_ID}/publish`, { method: "POST", headers, body: "{}" }, timeoutMs);
    if (published.postId !== DRAFT_ID) throw new Error("SEO_CORRECTION_PUBLISH_UNCERTAIN");
    record = await ledger.transition(record.version, "published", { wixPostId: published.postId });
    const verification = await verifyPublic(plan.expected);
    if (!verification?.verified) throw new Error("SEO_CORRECTION_PUBLIC_VERIFICATION_FAILED");
    record = await ledger.transition(record.version, "public_verified", { publicUrl: verification.url, publicVerification: verification, uncertain: false });
    return { status: record.state, replayBlocked: false, publicUrl: record.publicUrl, requestCounts: record.requestCounts, correctionFingerprint: plan.correctionFingerprint };
  } catch (error) {
    const beforeWrite = ["reserved", "preflight_verified"].includes(record.state);
    await ledger.transition(record.version, beforeWrite ? "failed_before_write" : "quarantined", { failureCode: String(error.message).slice(0, 160), uncertain: !beforeWrite });
    throw error;
  }
}

function zeroCounts() { return { draftGet: 0, draftUpdate: 0, draftVerify: 0, publish: 0 }; }
async function requestJson(fetchImpl, url, options, timeoutMs) { const response = await timed(fetchImpl, url, options, timeoutMs); if (!response.ok) throw new Error(`SEO_CORRECTION_WIX_HTTP_${response.status}`); return response.json(); }
async function timed(fetchImpl, url, options, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetchImpl(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }
