import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transitionContentState } from "../src/gate4Content.js";
import { sha256 } from "../src/identity.js";
import { approvedGate4Candidate } from "../src/wixOneShotExecutor.js";
import { buildAttemptAuthorization, FirestoreRestTransactionClient, InMemoryWixAttemptStore, WIX_ATTEMPT_SCOPE } from "../src/wixAttemptLedger.js";
import { executeAuthorizedWixDraft } from "../src/wixAttemptRuntime.js";

const legacyId = `wix-draft-execution-${approvedGate4Candidate.fingerprint}`;

function input() {
  const result = JSON.parse(fs.readFileSync(new URL("../docs/gate4-dry-run.json", import.meta.url), "utf8"));
  const review = transitionContentState(result.articleReview, "approved_for_draft_creation", { approvedFingerprint: result.articleReview.contentFingerprint, at: "2026-11-23T20:00:00.000Z" });
  return { review, wixDryRun: result.articleReview.wixDryRun, approvedFingerprint: approvedGate4Candidate.fingerprint, siteId: approvedGate4Candidate.siteId };
}

function auth(prepared, suffix = "1", changes = {}) {
  return buildAttemptAuthorization({ authorizationId: `auth-${suffix}`, attemptId: `attempt-${suffix}`, articleFingerprint: prepared.approvedFingerprint, transportChecksum: sha256(prepared.wixDryRun.payload), siteId: prepared.siteId, authorizedAt: "2026-11-23T20:01:00.000Z", parentAttemptId: legacyId, ...changes });
}

function store({ reconciled = true } = {}) {
  const s = new InMemoryWixAttemptStore({ now: clock() });
  s.preserveLegacyRecord({ id: legacyId, state: "uncertain", createRequestCount: 1, immutable: true });
  if (reconciled) return s.appendReconciliation({ reconciliationId: "recon-1", articleFingerprint: approvedGate4Candidate.fingerprint, siteId: approvedGate4Candidate.siteId, legacyRecordId: legacyId, outcome: "reconciled_draft_removed", evidence: { wixInventory: { drafts: 0, trash: 0 } } }).then(() => s);
  return Promise.resolve(s);
}

function credentials({ revoke = true } = {}) { return { lastSession: null, revoked: false, async acquire() { this.lastSession = { credential: "synthetic", siteId: approvedGate4Candidate.siteId }; return this.lastSession; }, async revoke() { this.revoked = revoke; }, async isRevoked() { return this.revoked; } }; }
function response(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }
function fetcher(prepared, calls, { loseCreate = false } = {}) { return async (_url, options) => { calls.push(options.method); if (options.method === "POST") { if (loseCreate) throw new Error("network timeout"); return response(200, { draftPost: { id: "draft-1" } }); } return response(200, { draftPost: { id: "draft-1", status: "UNPUBLISHED", ...prepared.wixDryRun.payload.draftPost, media: { displayed: true, custom: false } } }); }; }
function clock() { let i = 0; return () => `2026-11-23T20:${String(i++).padStart(2, "0")}:00.000Z`; }

test("legacy fingerprint-only record is immutable and append-only reconciliation permits a new authorization", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared); s.addAuthorization(a);
  const reserved = await s.reserveAuthorizedAttempt({ authorizationId: a.authorizationId, attemptId: a.attemptId, parentAttemptId: legacyId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: a.transportChecksum, seoSlug: prepared.wixDryRun.payload.draftPost.seoSlug });
  assert.equal(reserved.created, true); assert.equal(s.legacyRecords.get(legacyId).state, "uncertain");
  assert.deepEqual((await s.getArticleByFingerprint(prepared.approvedFingerprint, prepared.siteId)).reconciliationReferences, ["recon-1"]);
});

test("unresolved historical uncertainty blocks all new attempts", async () => {
  const prepared = input(); const s = await store({ reconciled: false }); const a = auth(prepared); s.addAuthorization(a);
  await assert.rejects(() => s.reserveAuthorizedAttempt({ authorizationId: a.authorizationId, attemptId: a.attemptId, parentAttemptId: legacyId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: a.transportChecksum }), /HISTORICAL_UNCERTAINTY/);
});

test("duplicate authorization and repeated attempt identities are rejected or replayed", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared); s.addAuthorization(a);
  assert.throws(() => s.addAuthorization(a), /AUTHORIZATION_DUPLICATE/);
  const args = { authorizationId: a.authorizationId, attemptId: a.attemptId, parentAttemptId: legacyId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: a.transportChecksum };
  assert.equal((await s.reserveAuthorizedAttempt(args)).created, true); assert.equal((await s.reserveAuthorizedAttempt(args)).created, false);
});

test("concurrent distinct authorizations are serialized by the article lock", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared, "1"); const b = auth(prepared, "2"); s.addAuthorization(a); s.addAuthorization(b);
  const make = (x) => s.reserveAuthorizedAttempt({ authorizationId: x.authorizationId, attemptId: x.attemptId, parentAttemptId: legacyId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: x.transportChecksum });
  const settled = await Promise.allSettled([make(a), make(b)]);
  assert.equal(settled.filter((x) => x.status === "fulfilled").length, 1); assert.match(settled.find((x) => x.status === "rejected").reason.message, /ACTIVE_ATTEMPT/);
});

test("changed fingerprint, checksum, site and scope fail before reservation", async () => {
  const prepared = input();
  for (const changes of [{ articleFingerprint: "a".repeat(64) }, { transportChecksum: "b".repeat(64) }, { siteId: "wrong" }, { scope: "publish" }]) {
    const s = await store(); const a = { ...auth(prepared), ...changes }; s.addAuthorization(a);
    await assert.rejects(() => s.reserveAuthorizedAttempt({ authorizationId: a.authorizationId, attemptId: a.attemptId, parentAttemptId: legacyId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: sha256(prepared.wixDryRun.payload) }), /AUTHORIZATION_/);
  }
});

test("full synthetic execution creates once, verifies content, revokes credential and replays with zero POST", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared); s.addAuthorization(a); const calls = []; const c = credentials();
  const options = { store: s, authorization: a, parentAttemptId: legacyId, seoSlug: prepared.wixDryRun.payload.draftPost.seoSlug, credentialSession: c, preparedInput: prepared, fetchImpl: fetcher(prepared, calls) };
  const first = await executeAuthorizedWixDraft(options); const replay = await executeAuthorizedWixDraft(options);
  assert.equal(first.status, "verified"); assert.equal(replay.replayBlocked, true); assert.deepEqual(calls, ["POST", "GET"]);
  const attempt = await s.getAttempt(a.attemptId); assert.equal(attempt.credentialRevoked, true); assert.equal(attempt.createRequestCount, 1);
  const article = await s.getArticleByFingerprint(prepared.approvedFingerprint, prepared.siteId); assert.deepEqual(article.verifiedWixDraftIds, ["draft-1"]); assert.equal(article.activeAttemptId, null);
});

test("a fresh-process replay preserves the verified credential-revocation evidence", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared); s.addAuthorization(a); const calls = [];
  const options = { store: s, authorization: a, parentAttemptId: legacyId, seoSlug: prepared.wixDryRun.payload.draftPost.seoSlug, preparedInput: prepared, fetchImpl: fetcher(prepared, calls) };
  await executeAuthorizedWixDraft({ ...options, credentialSession: credentials() });
  const replay = await executeAuthorizedWixDraft({ ...options, credentialSession: credentials() });
  assert.equal(replay.replayBlocked, true); assert.deepEqual(calls, ["POST", "GET"]);
  const attempt = await s.getAttempt(a.attemptId); assert.equal(attempt.credentialRevoked, true); assert.ok(attempt.credentialRevocationVerifiedAt);
});

test("lost Wix response quarantines attempt and blocks another authorization", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared, "1"); s.addAuthorization(a); const calls = [];
  await assert.rejects(() => executeAuthorizedWixDraft({ store: s, authorization: a, parentAttemptId: legacyId, credentialSession: credentials(), preparedInput: prepared, fetchImpl: fetcher(prepared, calls, { loseCreate: true }) }));
  assert.equal((await s.getAttempt(a.attemptId)).state, "uncertain");
  const b = auth(prepared, "2", { parentAttemptId: a.attemptId }); s.addAuthorization(b);
  await assert.rejects(() => s.reserveAuthorizedAttempt({ authorizationId: b.authorizationId, attemptId: b.attemptId, parentAttemptId: a.attemptId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: b.transportChecksum }), /ACTIVE_ATTEMPT/);
});

test("existing verified draft and published article reject subsequent attempts", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared, "1"); s.addAuthorization(a);
  let r = await s.reserveAuthorizedAttempt({ authorizationId: a.authorizationId, attemptId: a.attemptId, parentAttemptId: legacyId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: a.transportChecksum });
  r = await s.transitionAttempt(a.attemptId, r.record.version, "verified", { wixDraftId: "draft-existing" });
  const b = auth(prepared, "2", { parentAttemptId: a.attemptId }); s.addAuthorization(b);
  await assert.rejects(() => s.reserveAuthorizedAttempt({ authorizationId: b.authorizationId, attemptId: b.attemptId, parentAttemptId: a.attemptId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: b.transportChecksum }), /DRAFT_ALREADY_VERIFIED/);
  const article = await s.getArticleByFingerprint(prepared.approvedFingerprint, prepared.siteId); article.verifiedWixDraftIds = []; article.knownPublicationIds = ["post-1"]; s.articles.set(article.articleId, article);
  const c = auth(prepared, "3", { parentAttemptId: a.attemptId }); s.addAuthorization(c);
  await assert.rejects(() => s.reserveAuthorizedAttempt({ authorizationId: c.authorizationId, attemptId: c.attemptId, parentAttemptId: a.attemptId, fingerprint: prepared.approvedFingerprint, siteId: prepared.siteId, transportChecksum: c.transportChecksum }), /ALREADY_PUBLISHED/);
});

test("credential revocation failure remains explicit and does not authorize replay", async () => {
  const prepared = input(); const s = await store(); const a = auth(prepared); s.addAuthorization(a);
  await assert.rejects(() => executeAuthorizedWixDraft({ store: s, authorization: a, parentAttemptId: legacyId, credentialSession: credentials({ revoke: false }), preparedInput: prepared, fetchImpl: fetcher(prepared, []) }), /REVOCATION_UNVERIFIED/);
  assert.equal((await s.getAttempt(a.attemptId)).credentialRevoked, false);
});

test("authorization records are immutable in scope and checksum", () => {
  const prepared = input(); const a = auth(prepared);
  assert.equal(a.scope, WIX_ATTEMPT_SCOPE); assert.match(a.immutableChecksum, /^[a-f0-9]{64}$/); assert.equal(a.transportChecksum, "1e1b355813d4751c3c450c2e4869ff63555c68c2676812d6665398cd01e595fe");
});

test("Firestore REST transaction conflict fails closed and rolls back", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method });
    if (url.endsWith(":beginTransaction")) return response(200, { transaction: "tx-1" });
    if (url.endsWith(":commit")) return response(409, {});
    if (url.endsWith(":rollback")) return response(200, {});
    throw new Error("unexpected endpoint");
  };
  const client = new FirestoreRestTransactionClient({ projectId: "synthetic", accessToken: "synthetic", fetchImpl });
  await assert.rejects(() => client.transaction(({ commit }) => commit([])), /FIRESTORE_HTTP_409/);
  assert.equal(calls.filter((x) => x.url.endsWith(":rollback")).length, 1);
});
