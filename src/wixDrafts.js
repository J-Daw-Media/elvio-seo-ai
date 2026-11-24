import { stableId, sha256 } from "./identity.js";

export const wixPhase2Contract = Object.freeze({
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
  memberId: "ed017bc0-3db1-467e-9f2a-a345b6720e26",
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
      title: draft.title, seoSlug: draft.slug, memberId: wixPhase2Contract.memberId, excerpt: draft.metaDescription,
      richContent: htmlToWixRichContent(draft.bodyHtml),
      seoData: { tags: [{ type: "title", children: draft.seoTitle || draft.title }, { type: "meta", props: { name: "description", content: draft.metaDescription } }] },
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
    const inlineNodes = match[1].toLowerCase() === "p" ? inlineWixTextNodes(match[2]) : [{ type: "TEXT", textData: { text } }];
    nodes.push({ type: match[1].toLowerCase() === "p" ? "PARAGRAPH" : "HEADING", nodes: inlineNodes, ...(match[1].toLowerCase() === "p" ? {} : { headingData: { level: Number(match[1][1]) } }) });
  }
  if (!nodes.length) throw new Error("WIX_RICH_CONTENT_EMPTY");
  return { nodes };
}

function inlineWixTextNodes(html) {
  const nodes = [];
  const pattern = /<a\s+href=["'](https:\/\/www\.djelvio\.nl\/[a-z0-9\-/?#=&]*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let cursor = 0;
  for (const match of html.matchAll(pattern)) {
    const before = html.slice(cursor, match.index).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (before.trim()) nodes.push({ type: "TEXT", textData: { text: before } });
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    nodes.push({ type: "TEXT", textData: { text, decorations: [{ type: "LINK", linkData: { link: { url: match[1], target: "SELF" } } }] } });
    cursor = match.index + match[0].length;
  }
  const after = html.slice(cursor).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (after.trim()) nodes.push({ type: "TEXT", textData: { text: after } });
  return nodes.length ? nodes : [{ type: "TEXT", textData: { text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() } }];
}

export function draftMappingRecord({ contentFingerprint, wixDraftId = null, status = "prepared" } = {}) {
  if (!contentFingerprint) throw new Error("WIX_CONTENT_FINGERPRINT_REQUIRED");
  return { id: stableId("wix-draft-mapping", { contentFingerprint }), contentFingerprint, wixDraftId, status, publicationAuthorized: false };
}

export function assertWixEndpointAllowed(url, method = "POST") {
  const endpoint = new URL(url);
  const normalizedMethod = String(method).toUpperCase();
  const create = normalizedMethod === "POST" && endpoint.pathname === "/blog/v3/draft-posts";
  const retrieve = normalizedMethod === "GET" && /^\/blog\/v3\/draft-posts\/[a-z0-9-]{1,64}$/i.test(endpoint.pathname);
  if (endpoint.origin !== "https://www.wixapis.com" || (!create && !retrieve)) throw new Error("WIX_ENDPOINT_NOT_ALLOWED");
  return true;
}

export function assertWixWriteProhibited() { throw new Error("WIX_PHASE2_WRITES_NOT_AUTHORIZED"); }
