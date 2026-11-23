import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateArticle } from "../src/autopilotGeneration.js";
import { selectApprovedAsset, validateAssetRegistry, validateCreativeAsset } from "../src/creativeStudioRegistry.js";
import { uploadVerifiedImage } from "../src/wixMedia.js";
import { publishVerifiedDraft } from "../src/blogPublicationTransport.js";
import { prepareAutopilotCandidate, productionActivationState } from "../src/blogAutopilotRuntime.js";
import { verifyPublicArticle } from "../src/publicPageVerification.js";
import { runMilestoneBCreativeRehearsal } from "../src/milestoneBCreativeRehearsal.js";
import { loadBundledCreativeStudioRegistry, verifyCreativeStudioProductionAccess } from "../src/creativeStudioProduction.js";
import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";

const goodArticle = { title: "Titel", h1: "Titel", seoTitle: "SEO titel", seoDescription: "Beschrijving", excerpt: "Samenvatting", sections: [{}, {}, {}], ctaUrl: "https://www.djelvio.nl/contact", evidenceRefs: ["e1"], unsupportedClaims: [] };

test("generation retries once and remains evidence bound", async () => {
  let calls = 0;
  const result = await generateArticle({ opportunity: { id: "o1", evidence: { id: "e1" } }, model: "test", client: async () => ({ article: ++calls === 1 ? { title: "bad" } : goodArticle }) });
  assert.equal(result.attempts, 2); assert.equal(result.validation.passed, true); assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test("empty Creative Studio registry blocks image selection", () => {
  assert.deepEqual(validateAssetRegistry([]), { usable: 0, total: 0, empty: true, valid: true, duplicateDriveIds: [], duplicateChecksums: [], entries: [] });
  assert.equal(selectApprovedAsset([]).reason, "approved_asset_unavailable");
});

test("asset selection requires rights and provenance", () => {
  const result = selectApprovedAsset([{ assetId: "asset-1", driveFileId: "a", sourceFolderId: "folder", fileName: "a.jpg", status: "approved", rightsVerified: true, privacyStatus: "cleared", provenance: "owned", mimeType: "image/jpeg", width: 1600, height: 900, checksum: "abc", altText: "DJ booth", active: true, tags: ["wedding"], ownerApproval: { approvedAt: "2026-11-23T00:00:00Z", approvalRef: "owner-review-1" } }], { topicTags: ["wedding"] });
  assert.equal(result.available, true); assert.equal(result.asset.driveFileId, "a");
});

test("pending owner approval and uncleared privacy remain non-selectable", () => {
  const base = { assetId: "asset-2", driveFileId: "b", sourceFolderId: "folder", fileName: "b.jpg", status: "pending_owner_approval", rightsVerified: false, privacyStatus: "review_required", provenance: "source_folder_inventory", mimeType: "image/jpeg", width: 1200, height: 800, checksum: "def", altText: "Dansvloer", active: true };
  assert.equal(validateCreativeAsset(base).valid, true);
  assert.equal(selectApprovedAsset([base]).available, false);
});

test("approved records fail closed without privacy, owner approval, checksum or active file", () => {
  const result = validateCreativeAsset({ assetId: "asset-3", driveFileId: "c", sourceFolderId: "folder", fileName: "c.jpg", status: "approved", rightsVerified: true, provenance: "owned", mimeType: "image/jpeg", width: 1200, height: 800, altText: "DJ", privacyStatus: "review_required", active: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("checksum_required"));
  assert.ok(result.errors.includes("privacy_not_cleared"));
  assert.ok(result.errors.includes("owner_approval_required"));
  assert.ok(result.errors.includes("asset_not_active"));
});

test("registry rejects duplicate Drive identities and checksums", () => {
  const base = { assetId: "asset-4", driveFileId: "same", sourceFolderId: "folder", fileName: "a.jpg", status: "candidate", provenance: "inventory", mimeType: "image/jpeg", width: 1200, height: 800, checksum: "same-checksum", altText: "DJ setup" };
  const report = validateAssetRegistry([base, { ...base, assetId: "asset-5", fileName: "b.jpg" }]);
  assert.equal(report.valid, false);
  assert.deepEqual(report.duplicateDriveIds, ["same"]);
  assert.deepEqual(report.duplicateChecksums, ["same-checksum"]);
});

test("owner-approved Pexels detail library is valid, unique and topic-selectable", () => {
  const records = JSON.parse(fs.readFileSync(new URL("../docs/creative-studio-approved-assets-2026-11-23.json", import.meta.url), "utf8"));
  const report = validateAssetRegistry(records);
  assert.equal(records.length, 12);
  assert.equal(report.valid, true);
  assert.equal(report.usable, 12);
  assert.deepEqual(report.duplicateDriveIds, []);
  assert.deepEqual(report.duplicateChecksums, []);
  assert.equal(selectApprovedAsset(records, { topicTags: ["wedding", "table-decoration"] }).asset.categories.includes("wedding"), true);
  assert.equal(selectApprovedAsset(records, { topicTags: ["dj-equipment", "mixer"] }).asset.categories.includes("equipment"), true);
});

test("production Creative Studio access verifies bounded object metadata and expected checksums", async () => {
  const records = loadBundledCreativeStudioRegistry();
  const seen = [];
  const result = await verifyCreativeStudioProductionAccess({
    records,
    bucket: "synthetic-bucket",
    accessToken: "synthetic-token",
    fetchImpl: async (url, options) => {
      seen.push({ url, auth: options.headers.Authorization });
      const fileName = decodeURIComponent(url).split("/").at(-1);
      const record = records.find((item) => item.fileName === fileName);
      return { ok: true, json: async () => ({ generation: "1", metadata: { sha256: record.checksum } }) };
    },
  });
  assert.equal(result.status, "available");
  assert.equal(result.verifiedAssets, 12);
  assert.equal(result.writesPerformed, 0);
  assert.equal(seen.length, 12);
  assert.ok(seen.every((item) => item.auth === "Bearer synthetic-token"));
});

test("production Creative Studio access fails closed on inaccessible or mismatched objects", async () => {
  const records = loadBundledCreativeStudioRegistry().slice(0, 2);
  let call = 0;
  const result = await verifyCreativeStudioProductionAccess({ records, bucket: "synthetic", accessToken: "token", fetchImpl: async () => (++call === 1 ? { ok: false, status: 403 } : { ok: true, json: async () => ({ metadata: { sha256: "wrong" } }) }) });
  assert.equal(result.status, "incomplete");
  assert.equal(result.verifiedAssets, 0);
});

test("Wix media uses only generated signed upload and verifies READY", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options.method]); return url.includes("generate-upload-url") ? { ok: true, json: async () => ({ uploadUrl: "https://upload.example/signed" }) } : { ok: true, json: async () => ({ file: { id: "file1", state: "READY", mimeType: "image/jpeg" } }) }; };
  const result = await uploadVerifiedImage({ fetchImpl, credential: "x", siteId: "s", bytes: Buffer.from("x"), fileName: "a.jpg", mimeType: "image/jpeg" });
  assert.equal(result.fileId, "file1"); assert.deepEqual(calls.map((x) => x[1]), ["POST", "PUT"]);
});

test("runtime is fail closed by default and blocks without approved image", () => {
  assert.deepEqual(productionActivationState({}), { mode: "disabled", killSwitch: true, wixCredentialAvailable: false, publicationEnabled: false });
  const prepared = prepareAutopilotCandidate({ candidate: { id: "c" }, assets: [] });
  assert.equal(prepared.executable, false); assert.equal(prepared.holdReason, "approved_asset_unavailable");
});

test("publication writes started before request and quarantines uncertain response", async () => {
  const events = [];
  const ledger = { markStarted: async () => events.push("started"), markVerified: async () => events.push("verified"), quarantine: async () => events.push("quarantined") };
  await assert.rejects(publishVerifiedDraft({ candidate: { wixDraftId: "d1", contentFingerprint: "f", draftVerified: true }, reservation: { created: true, publicationAttemptId: "a1" }, credential: "x", siteId: "s", killSwitch: false, ledger, fetchImpl: async () => ({ ok: true, json: async () => ({}) }), verifyPublic: async () => ({ verified: true }) }), /UNCERTAIN/);
  assert.deepEqual(events, ["started", "quarantined"]);
});

test("public page verification checks canonical metadata CTA image and indexability", async () => {
  const html = '<html><head><title>SEO</title><link rel="canonical" href="https://www.djelvio.nl/blog/x"></head><body><h1>H1</h1><a href="https://www.djelvio.nl/contact">Contact</a><img src="image1"></body></html>';
  const result = await verifyPublicArticle({ url: "https://www.djelvio.nl/blog/x", expected: { seoTitle: "SEO", canonicalUrl: "https://www.djelvio.nl/blog/x", h1: "H1", ctaUrl: "https://www.djelvio.nl/contact", imageIdentity: "image1" }, fetchImpl: async () => ({ ok: true, url: "https://www.djelvio.nl/blog/x", text: async () => html }) });
  assert.equal(result.verified, true);
});

test("Milestone B rehearsal covers all fifteen stages without external activity", () => {
  const result = runMilestoneBCreativeRehearsal();
  assert.equal(result.steps.length, 15);
  assert.equal(result.passed, true);
  assert.equal(result.externalWrites, 0);
  assert.equal(result.externalRequests, 0);
});

test("first publication package binds exploratory evidence, exact article, image, Wix destination and fingerprints", () => {
  const prepared = buildFirstPublicationPackage();
  assert.equal(prepared.selection.evidenceDecision.sufficient, true);
  assert.equal(prepared.selection.classification, "evidence_backed_exploratory_opportunity");
  assert.equal(prepared.image.assetId, "pexels-34307990-v1");
  assert.equal(prepared.image.illustrativeStock, true);
  assert.equal(prepared.image.actualDjElvioEvent, false);
  assert.match(prepared.article.contentFingerprint, /^[a-f0-9]{64}$/);
  assert.match(prepared.publicationFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(prepared.wix.siteId, "fe9762c6-cdbd-404c-ba42-c2b834b052e2");
  assert.equal(prepared.wix.existingHistoricalDraftId, "cf13a806-22ee-43c2-bb29-c362132bf325");
  assert.equal(prepared.wix.duplicateDraftCreationAllowed, false);
  assert.equal(prepared.wix.publicationAuthorized, false);
});
