import { stableId, sha256 } from "./identity.js";

export const wixPhase2Contract = Object.freeze({
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
  draftEndpoint: "https://www.wixapis.com/blog/v3/draft-posts",
  liveCredentialsAvailable: false,
  draftWritesEnabled: false,
  publishingEnabled: false,
  rollback: "Archive or unpublish only after owner-approved public verification and exact draft identity check.",
});

export function buildWixDraftPayload(draft, image = null) {
  if (!draft?.validation?.valid) throw new Error("validated_draft_required");
  const contentFingerprint = sha256(draft);
  return {
    deterministicDraftId: stableId("wix-blog-draft", { contentFingerprint }), contentFingerprint,
    siteId: wixPhase2Contract.siteId,
    endpoint: wixPhase2Contract.draftEndpoint,
    payload: { draftPost: {
      title: draft.title, slug: draft.slug, excerpt: draft.metaDescription,
      richContent: { nodes: [{ type: "PARAGRAPH", nodes: [{ type: "TEXT", textData: { text: draft.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() } }] }] },
      seoData: { tags: [{ type: "title", children: draft.title }, { type: "meta", props: { name: "description", content: draft.metaDescription } }] },
      media: image ? { wixMedia: { image: image.sourceUrl } } : undefined,
    } },
    mode: "dry_run_only", writesPerformed: 0, publishAllowed: false,
  };
}

export function assertWixWriteProhibited() { throw new Error("WIX_PHASE2_WRITES_NOT_AUTHORIZED"); }
