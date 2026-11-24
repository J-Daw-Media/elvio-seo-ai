import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";
import { buildFirstPublicationAuthorization, InMemoryFirstPublicationLedger } from "../src/firstPublicationTrial.js";
import { recoverFirstPublication } from "../src/firstPublicationRecovery.js";

const bytes = Buffer.from("approved image");
const packageData = buildFirstPublicationPackage();
packageData.image.checksum = createHash("sha256").update(bytes).digest("hex");
const authorization = buildFirstPublicationAuthorization({ authorizationId: "owner-recovery", attemptId: "recovery-1", approvedAt: "2026-11-24T06:00:00+01:00" });

async function parent() {
  const ledger = new InMemoryFirstPublicationLedger();
  let record = (await ledger.reserve({ attemptId: "original" })).record;
  record = await ledger.transition(record.version, "quarantined", { failureCode: "WIX_MEDIA_VERIFICATION_FAILED", requestCounts: { imageUrl: 1, imageUpload: 1, draftUpdate: 0, publish: 0 }, credentialRevoked: true });
  return ledger;
}
function response(body) { return { ok: true, status: 200, async json() { return structuredClone(body); }, async arrayBuffer() { return bytes; } }; }
function fetcher(calls) { return async (url, options) => { calls.push([url, options.method, options.body]); if (url.endsWith("/files/search")) return response({ files: [{ id: "img-1", displayName: packageData.image.fileName, operationStatus: "READY", mediaType: "IMAGE", url: "https://static.wixstatic.com/media/img-1.jpg" }] }); if (url.includes("static.wixstatic.com")) return response({}); if (url.endsWith("/query")) return response({ draftPosts: [{ id: packageData.wix.existingHistoricalDraftId, title: packageData.article.title, seoSlug: packageData.article.slug, status: "UNPUBLISHED" }] }); if (options.method === "PATCH") return response({ draftPost: { id: packageData.wix.existingHistoricalDraftId } }); if (options.method === "GET") return response({ draftPost: { id: packageData.wix.existingHistoricalDraftId } }); if (url.endsWith("/publish")) return response({ postId: "post-1" }); throw new Error(url); }; }

test("recovery reuses the exact uploaded image, updates the existing draft and publishes once", async () => {
  const calls = []; const recoveryLedger = new InMemoryFirstPublicationLedger();
  const result = await recoverFirstPublication({ packageData, authorization, originalLedger: await parent(), recoveryLedger, credential: "restricted", fetchImpl: fetcher(calls), verifyDraft: async () => ({ verified: true }), verifyPublic: async () => ({ verified: true, url: packageData.article.expectedPublicUrl }) });
  assert.equal(result.status, "public_verified");
  assert.equal(calls.filter(([url]) => url.endsWith("/files/search")).length, 1);
  assert.equal(calls.some(([url]) => url.includes("generate-upload-url")), false);
  assert.equal(calls.filter(([, method]) => method === "PATCH").length, 1);
  const patchBody = JSON.parse(calls.find(([, method]) => method === "PATCH")[2]);
  assert.deepEqual(patchBody.draftPost.media, {
    wixMedia: { image: { id: "img-1", url: "https://static.wixstatic.com/media/img-1.jpg" } },
    displayed: true,
    custom: true,
    altText: packageData.image.altText,
  });
  assert.equal(calls.filter(([url]) => url.endsWith("/publish")).length, 1);
  const replay = await recoverFirstPublication({ packageData, authorization, originalLedger: await parent(), recoveryLedger, credential: "restricted", fetchImpl: fetcher(calls), verifyDraft: async () => ({ verified: true }), verifyPublic: async () => ({ verified: true, url: packageData.article.expectedPublicUrl }) });
  assert.equal(replay.replayBlocked, true);
});

test("recovery rejects a non-quarantined or write-started parent", async () => {
  const originalLedger = new InMemoryFirstPublicationLedger(); await originalLedger.reserve({ attemptId: "wrong" });
  await assert.rejects(() => recoverFirstPublication({ packageData, authorization, originalLedger, recoveryLedger: new InMemoryFirstPublicationLedger(), credential: "restricted", fetchImpl: fetcher([]), verifyDraft: async () => ({ verified: true }), verifyPublic: async () => ({ verified: true }) }), /PARENT_MISMATCH/);
});
