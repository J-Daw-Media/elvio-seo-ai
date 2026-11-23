import { assertPublicationEndpointAllowed } from "./blogPublicationExecutor.js";

export async function publishVerifiedDraft({ candidate, reservation, credential, siteId, killSwitch = true, fetchImpl = fetch, ledger, verifyPublic, timeoutMs = 15000 } = {}) {
  if (killSwitch) throw new Error("BLOG_AUTOPILOT_KILL_SWITCH_ACTIVE");
  if (!candidate?.wixDraftId || !candidate?.contentFingerprint || candidate.draftVerified !== true || reservation?.created !== true || !reservation.publicationAttemptId) throw new Error("PUBLICATION_PREFLIGHT_FAILED");
  const url = `https://www.wixapis.com/blog/v3/draft-posts/${encodeURIComponent(candidate.wixDraftId)}/publish`;
  assertPublicationEndpointAllowed(url, "POST", candidate.wixDraftId);
  await ledger.markStarted(reservation.publicationAttemptId);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "POST", headers: { authorization: credential, "wix-site-id": siteId, "content-type": "application/json" }, body: "{}", signal: controller.signal });
    if (!response.ok) throw new Error(`WIX_PUBLISH_HTTP_${response.status}`);
    const body = await response.json();
    if (!body.postId) throw new Error("WIX_PUBLISH_RESPONSE_UNCERTAIN");
    const verification = await verifyPublic(body.postId);
    if (!verification?.verified) throw new Error("PUBLICATION_VERIFICATION_FAILED");
    await ledger.markVerified(reservation.publicationAttemptId, { postId: body.postId, publicUrl: verification.url });
    return { status: "published_verified", postId: body.postId, publicUrl: verification.url };
  } catch (error) {
    await ledger.quarantine(reservation.publicationAttemptId, { reason: /abort|timeout/i.test(String(error)) ? "timeout_uncertain" : "publication_uncertain" });
    throw error;
  } finally { clearTimeout(timer); }
}
