export const wixBlogDraftContract = Object.freeze({
  siteId: "fe9762c6-cdbd-404c-ba42-c2b834b052e2",
  endpoint: "https://www.wixapis.com/blog/v3/draft-posts",
  requiredPermission: "Manage Blog",
  createDuringPhase01: false,
  publishDuringPhase01: false,
  deleteDuringPhase01: false,
  requiredFields: ["title", "richContent"],
  recommendedFields: ["excerpt", "media", "categoryIds", "tagIds", "seoData"],
  idempotency: "Store returned draft ID and content hash before any separately approved write test.",
});

export function assertNoWixWrite() { throw new Error("WIX_CONTENT_WRITES_NOT_AUTHORIZED_PHASE_0_1"); }
