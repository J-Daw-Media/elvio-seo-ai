import test from "node:test";
import assert from "node:assert/strict";
import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";
import { buildFirstPublicationSeoCorrection, executeFirstPublicationSeoCorrection } from "../src/firstPublicationSeoCorrection.js";
import { InMemoryFirstPublicationLedger } from "../src/firstPublicationTrial.js";

const packageData = buildFirstPublicationPackage();
const image = { id: "img-1.jpg", url: "https://static.wixstatic.com/media/img-1.jpg" };

test("SEO correction keeps one native H1 and applies approved SEO title", () => {
  const plan = buildFirstPublicationSeoCorrection(packageData, image);
  assert.equal(plan.draft.seoData.tags.find((tag) => tag.type === "title").children, packageData.article.seoTitle);
  assert.equal(plan.draft.richContent.nodes.filter((node) => node.type === "HEADING" && node.headingData?.level === 1).length, 0);
  assert.equal(plan.expected.h1Count, 1);
});

test("SEO correction updates and publishes once, then replays with zero requests", async () => {
  const ledger = new InMemoryFirstPublicationLedger(); const calls = [];
  const response = (body) => ({ ok: true, status: 200, json: async () => structuredClone(body) });
  const fetchImpl = async (url, options) => {
    calls.push([url, options.method]);
    if (options.method === "PATCH") return response({ draftPost: { id: packageData.wix.existingHistoricalDraftId } });
    if (url.endsWith("/publish")) return response({ postId: packageData.wix.existingHistoricalDraftId });
    if (options.method === "GET" && calls.filter(([, method]) => method === "GET").length === 1) return response({ draftPost: { id: packageData.wix.existingHistoricalDraftId, status: "PUBLISHED", media: { wixMedia: { image } } } });
    const plan = buildFirstPublicationSeoCorrection(packageData, image);
    return response({ draftPost: { ...plan.draft, status: "PUBLISHED" } });
  };
  const result = await executeFirstPublicationSeoCorrection({ packageData, image, ledger, credential: "restricted", fetchImpl, verifyPublic: async () => ({ verified: true, url: packageData.article.expectedPublicUrl }) });
  assert.equal(result.status, "public_verified");
  assert.equal(calls.filter(([, method]) => method === "PATCH").length, 1);
  assert.equal(calls.filter(([url]) => url.endsWith("/publish")).length, 1);
  const before = calls.length;
  const replay = await executeFirstPublicationSeoCorrection({ packageData, image, ledger, credential: "restricted", fetchImpl, verifyPublic: async () => ({ verified: true }) });
  assert.equal(replay.replayBlocked, true);
  assert.equal(calls.length, before);
});
