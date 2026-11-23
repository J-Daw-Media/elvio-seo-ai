import { stableId, sha256 } from "./identity.js";

export const wixPhase2Contract = Object.freeze({
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
  draftEndpoint: "https://www.wixapis.com/blog/v3/draft-posts",
  liveCredentialsAvailable: false,
  draftWritesEnabled: false,
  publishingEnabled: false,
  schemaVersion: "wix-blog-draft-v3",
  createPermission: "Manage Blog",
  readPermission: "Read Draft Blog Posts",
  publishEndpointAllowed: false,
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
      richContent: htmlToWixRichContent(draft.bodyHtml),
      seoData: { tags: [{ type: "title", children: draft.title }, { type: "meta", props: { name: "description", content: draft.metaDescription } }] },
      media: image ? { wixMedia: { image: image.sourceUrl } } : undefined,
    }, fieldsets: ["RICH_CONTENT", "URL"], publish: false },
    mode: "dry_run_only", writesPerformed: 0, publishAllowed: false,
  };
}

export function htmlToWixRichContent(html = "") {
  const nodes = [];
  const matcher = /<(h[1-3]|p)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(matcher)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    nodes.push({ type: match[1].toLowerCase() === "p" ? "PARAGRAPH" : "HEADING", nodes: [{ type: "TEXT", textData: { text } }], ...(match[1].toLowerCase() === "p" ? {} : { headingData: { level: Number(match[1][1]) } }) });
  }
  if (!nodes.length) throw new Error("WIX_RICH_CONTENT_EMPTY");
  return { nodes };
}

export function draftMappingRecord({ contentFingerprint, wixDraftId = null, status = "prepared" } = {}) {
  if (!contentFingerprint) throw new Error("WIX_CONTENT_FINGERPRINT_REQUIRED");
  return { id: stableId("wix-draft-mapping", { contentFingerprint }), contentFingerprint, wixDraftId, status, publicationAuthorized: false };
}

export function assertWixEndpointAllowed(url) {
  const endpoint = new URL(url);
  if (endpoint.origin !== "https://www.wixapis.com" || endpoint.pathname !== "/blog/v3/draft-posts") throw new Error("WIX_ENDPOINT_NOT_ALLOWED");
  return true;
}

export function assertWixWriteProhibited() { throw new Error("WIX_PHASE2_WRITES_NOT_AUTHORIZED"); }
