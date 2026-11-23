import test from "node:test";
import assert from "node:assert/strict";
import { generateArticle } from "../src/autopilotGeneration.js";
import { selectApprovedAsset, validateAssetRegistry } from "../src/creativeStudioRegistry.js";
import { uploadVerifiedImage } from "../src/wixMedia.js";
import { publishVerifiedDraft } from "../src/blogPublicationTransport.js";
import { prepareAutopilotCandidate, productionActivationState } from "../src/blogAutopilotRuntime.js";
import { verifyPublicArticle } from "../src/publicPageVerification.js";

const goodArticle = { title: "Titel", h1: "Titel", seoTitle: "SEO titel", seoDescription: "Beschrijving", excerpt: "Samenvatting", sections: [{}, {}, {}], ctaUrl: "https://www.djelvio.nl/contact", evidenceRefs: ["e1"], unsupportedClaims: [] };

test("generation retries once and remains evidence bound", async () => {
  let calls = 0;
  const result = await generateArticle({ opportunity: { id: "o1", evidence: { id: "e1" } }, model: "test", client: async () => ({ article: ++calls === 1 ? { title: "bad" } : goodArticle }) });
  assert.equal(result.attempts, 2); assert.equal(result.validation.passed, true); assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test("empty Creative Studio registry blocks image selection", () => {
  assert.deepEqual(validateAssetRegistry([]), { usable: 0, total: 0, empty: true });
  assert.equal(selectApprovedAsset([]).reason, "approved_asset_unavailable");
});

test("asset selection requires rights and provenance", () => {
  const result = selectApprovedAsset([{ driveFileId: "a", status: "approved", rightsVerified: true, provenance: "owned", mimeType: "image/jpeg", tags: ["wedding"] }], { topicTags: ["wedding"] });
  assert.equal(result.available, true); assert.equal(result.asset.driveFileId, "a");
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
