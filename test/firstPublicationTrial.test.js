import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";
import { buildFirstPublicationAuthorization, executeFirstPublicationTrial, InMemoryFirstPublicationLedger, assertEndpoint } from "../src/firstPublicationTrial.js";

const imageBytes = Buffer.from("synthetic image bytes");
const packageData = buildFirstPublicationPackage();
const authorization = buildFirstPublicationAuthorization({ authorizationId: "owner-approval-1", attemptId: "first-publication-1", approvedAt: "2026-11-24T09:00:00.000Z" });

function credentialSession() { return { revoked: false, async acquire() { return { credential: "synthetic", siteId: packageData.wix.siteId }; }, async revoke() { this.revoked = true; }, async isRevoked() { return this.revoked; } }; }
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }
function fetcher(calls, { failAt = null } = {}) {
  return async (url, options) => {
    calls.push([url, options.method]); if (failAt && calls.length === failAt) throw new Error("network timeout");
    if (url.endsWith("/query")) return response({ draftPosts: [{ id: packageData.wix.existingHistoricalDraftId, title: packageData.article.title, seoSlug: packageData.article.slug, status: "UNPUBLISHED" }] });
    if (url.includes("generate-upload-url")) return response({ uploadUrl: "https://upload.example/image" });
    if (url === "https://upload.example/image") return response({ file: { id: "wix-image-1", state: "READY", mimeType: "image/jpeg", url: "wix:image://v1/wix-image-1/file.jpg" } });
    if (options.method === "PATCH") return response({ draftPost: { id: packageData.wix.existingHistoricalDraftId } });
    if (options.method === "GET") return response({ draftPost: { id: packageData.wix.existingHistoricalDraftId, status: "UNPUBLISHED" } });
    if (url.endsWith("/publish")) return response({ postId: "post-1" });
    throw new Error(`unexpected ${options.method} ${url}`);
  };
}

const verifyDraft = async (_draft, context) => context.stage === "pre_update" ? { verified: true } : { verified: true, content: true, image: true };
const verifyPublic = async () => ({ verified: true, url: packageData.article.expectedPublicUrl, indexable: true, indexed: "not_claimed" });

test("first publication trial updates the exact existing draft, publishes once, revokes credentials and replays with zero requests", async () => {
  const ledger = new InMemoryFirstPublicationLedger(); const calls = []; const credentials = credentialSession();
  const options = { packageData, authorization, ledger, credentialSession: credentials, imageBytes, hashBytes: () => packageData.image.checksum, fetchImpl: fetcher(calls), verifyDraft, verifyPublic, killSwitch: false };
  const first = await executeFirstPublicationTrial(options); const callCount = calls.length; const second = await executeFirstPublicationTrial(options);
  assert.equal(first.status, "public_verified"); assert.equal(second.replayBlocked, true); assert.equal(calls.length, callCount);
  assert.equal(calls.filter(([, method]) => method === "PATCH").length, 1);
  assert.equal(calls.filter(([url]) => url.endsWith("/publish")).length, 1);
  assert.equal(calls.some(([url, method]) => url === "https://www.wixapis.com/blog/v3/draft-posts" && method === "POST"), false);
  assert.equal((await ledger.get()).credentialRevoked, true);
});

test("uncertain image upload halts and quarantines without draft update or publication", async () => {
  const ledger = new InMemoryFirstPublicationLedger(); const calls = [];
  await assert.rejects(() => executeFirstPublicationTrial({ packageData, authorization, ledger, credentialSession: credentialSession(), imageBytes, hashBytes: () => packageData.image.checksum, fetchImpl: fetcher(calls, { failAt: 3 }), verifyDraft, verifyPublic, killSwitch: false }), /timeout/);
  assert.equal((await ledger.get()).state, "quarantined");
  assert.equal(calls.some(([, method]) => method === "PATCH"), false);
  assert.equal(calls.some(([url]) => url.endsWith("/publish")), false);
  const before = calls.length;
  const replay = await executeFirstPublicationTrial({ packageData, authorization, ledger, credentialSession: credentialSession(), imageBytes, hashBytes: () => packageData.image.checksum, fetchImpl: fetcher(calls), verifyDraft, verifyPublic, killSwitch: false });
  assert.equal(replay.replayBlocked, true); assert.equal(calls.length, before);
});

test("kill switch, changed image, changed fingerprint and wrong endpoints fail before Wix writes", async () => {
  const base = { packageData, authorization, ledger: new InMemoryFirstPublicationLedger(), credentialSession: credentialSession(), imageBytes, hashBytes: () => packageData.image.checksum, fetchImpl: fetcher([]), verifyDraft, verifyPublic };
  await assert.rejects(() => executeFirstPublicationTrial({ ...base, killSwitch: true }), /KILL_SWITCH/);
  await assert.rejects(() => executeFirstPublicationTrial({ ...base, ledger: new InMemoryFirstPublicationLedger(), imageBytes: Buffer.from("changed"), hashBytes: () => "wrong", killSwitch: false }), /IMAGE_CHECKSUM/);
  await assert.rejects(() => executeFirstPublicationTrial({ ...base, ledger: new InMemoryFirstPublicationLedger(), packageData: { ...packageData, publicationFingerprint: "0".repeat(64) }, killSwitch: false }), /PACKAGE_MISMATCH/);
  for (const [url, method] of [["https://www.wixapis.com/blog/v3/draft-posts", "POST"], ["https://www.wixapis.com/blog/v3/draft-posts/other", "PATCH"], ["https://evil.example/blog/v3/draft-posts/query", "POST"]]) assert.throws(() => assertEndpoint(url, method), /NOT_ALLOWED/);
});

test("default image guard hashes the exact raw bytes", async () => {
  const bytes = Buffer.from("exact approved image bytes");
  const exactPackage = structuredClone(packageData);
  exactPackage.image.checksum = createHash("sha256").update(bytes).digest("hex");
  const result = await executeFirstPublicationTrial({
    packageData: exactPackage,
    authorization,
    ledger: new InMemoryFirstPublicationLedger(),
    credentialSession: credentialSession(),
    imageBytes: bytes,
    fetchImpl: fetcher([]),
    verifyDraft,
    verifyPublic,
    killSwitch: false,
  });
  assert.equal(result.status, "public_verified");
});
