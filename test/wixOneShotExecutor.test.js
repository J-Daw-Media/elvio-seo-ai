import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gate4DryRunExample } from "../src/gate4Examples.js";
import { transitionContentState } from "../src/gate4Content.js";
import { WixOneShotExecutor, approvedGate4Candidate } from "../src/wixOneShotExecutor.js";
import { FirestoreWixExecutionLedger, sanitizeExecutionRecord } from "../src/wixExecutionLedger.js";
import { SecretManagerWixCredentialSession } from "../src/wixCredentialSession.js";

class SyntheticLedger {
  constructor({ failTransitionAt = null } = {}) { this.records = new Map(); this.failTransitionAt = failTransitionAt; }
  async reserve(record) {
    const current = this.records.get(record.fingerprint);
    if (current) return { created: false, record: structuredClone(current) };
    const created = { ...record, state: "reserved", version: 1 };
    this.records.set(record.fingerprint, created);
    return { created: true, record: structuredClone(created) };
  }
  async get(fingerprint) { return structuredClone(this.records.get(fingerprint) || null); }
  async transition(fingerprint, expectedVersion, state, patch = {}) {
    if (this.failTransitionAt === state) throw new Error("SYNTHETIC_PERSISTENCE_FAILURE");
    const current = this.records.get(fingerprint);
    if (!current || current.version !== expectedVersion) throw new Error("WIX_LEDGER_CONFLICT");
    const next = { ...current, ...patch, state, version: expectedVersion + 1 };
    this.records.set(fingerprint, next);
    return structuredClone(next);
  }
}

class SyntheticCredentialSession {
  constructor({ siteId = approvedGate4Candidate.siteId, revokeFails = false } = {}) { this.siteId = siteId; this.revokeFails = revokeFails; this.revoked = false; }
  async acquire() { return { credential: "synthetic-secret-never-log", siteId: this.siteId, id: "synthetic-key" }; }
  async revoke() { if (!this.revokeFails) this.revoked = true; }
  async isRevoked() { return this.revoked; }
}

function prepared() {
  const result = gate4DryRunExample();
  const approved = transitionContentState(result.articleReview, "approved_for_draft_creation", { approvedFingerprint: result.articleReview.contentFingerprint, at: "2026-11-23T12:00:00.000Z" });
  return { review: approved, wixDryRun: result.articleReview.wixDryRun, approvedFingerprint: approvedGate4Candidate.fingerprint, siteId: approvedGate4Candidate.siteId };
}

function response(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }

function successfulFetch(payload, calls) {
  return async (url, options) => {
    calls.push({ url, method: options.method, body: options.body, headers: options.headers });
    if (options.method === "POST") return response(200, { draftPost: { id: "wix-draft-123" } });
    return response(200, { draftPost: { id: "wix-draft-123", status: "DRAFT", ...payload.draftPost } });
  };
}

test("one-shot executor creates exactly once, retrieves exact ID and records verified result", async () => {
  const input = prepared(); const ledger = new SyntheticLedger(); const credentials = new SyntheticCredentialSession(); const calls = [];
  const executor = new WixOneShotExecutor({ ledger, credentialSession: credentials, fetchImpl: successfulFetch(input.wixDryRun.payload, calls) });
  const result = await executor.execute(input);
  assert.equal(result.status, "verified"); assert.equal(result.postRequests, 1); assert.equal(result.wixDraftId, "wix-draft-123");
  assert.deepEqual(calls.map((item) => item.method), ["POST", "GET"]);
  assert.match(calls[1].url, /draft-posts\/wix-draft-123$/);
  assert.equal(JSON.parse(calls[0].body).publish, false);
  assert.equal(credentials.revoked, true);
  const stored = await ledger.get(input.approvedFingerprint);
  assert.equal(stored.state, "verified"); assert.equal(stored.wixDraftId, "wix-draft-123"); assert.equal(stored.createRequestCount, 1);
  assert.doesNotMatch(JSON.stringify(stored), /synthetic-secret/);
});

test("atomic reservation permits one concurrent execution and blocks the other before POST", async () => {
  const input = prepared(); const ledger = new SyntheticLedger(); const calls = [];
  const make = () => new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: successfulFetch(input.wixDryRun.payload, calls) });
  const results = await Promise.all([make().execute(input), make().execute(input)]);
  assert.equal(calls.filter((item) => item.method === "POST").length, 1);
  assert.equal(results.filter((item) => item.postRequests === 0).length, 1);
});

test("verified replay performs zero requests", async () => {
  const input = prepared(); const ledger = new SyntheticLedger(); const calls = []; const credentials = new SyntheticCredentialSession();
  const executor = new WixOneShotExecutor({ ledger, credentialSession: credentials, fetchImpl: successfulFetch(input.wixDryRun.payload, calls) });
  await executor.execute(input); calls.length = 0;
  const replay = await executor.execute(input);
  assert.equal(replay.replayBlocked, true); assert.equal(replay.postRequests, 0); assert.equal(calls.length, 0);
});

test("changed fingerprint, site mismatch, missing approval, image and publication fail before reservation", async () => {
  for (const mutate of [
    (x) => { x.approvedFingerprint = "a".repeat(64); },
    (x) => { x.siteId = "wrong-site"; },
    (x) => { x.review.state = "owner_review"; },
    (x) => { x.wixDryRun.payload.publish = true; },
    (x) => { x.wixDryRun.payload.draftPost.media = { wixMedia: { image: "x" } }; },
  ]) {
    const input = prepared(); mutate(input); const ledger = new SyntheticLedger();
    await assert.rejects(() => new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async () => { throw new Error("should not run"); } }).execute(input));
    assert.equal(ledger.records.size, 0);
  }
});

test("timeout or network interruption after request start quarantines and replay never posts", async () => {
  const input = prepared(); const ledger = new SyntheticLedger(); let posts = 0;
  const executor = new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async () => { posts++; throw new Error("network timeout"); } });
  await assert.rejects(() => executor.execute(input), /timeout/);
  assert.equal((await ledger.get(input.approvedFingerprint)).state, "uncertain");
  const replay = await executor.execute(input);
  assert.equal(replay.quarantined, true); assert.equal(replay.postRequests, 0); assert.equal(posts, 1);
});

test("lost create response and failure before draft ID persistence remain blocked", async () => {
  const input = prepared(); const ledger = new SyntheticLedger({ failTransitionAt: "created" }); let posts = 0;
  const executor = new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async () => { posts++; return response(200, { draftPost: { id: "wix-created-but-not-saved" } }); } });
  await assert.rejects(() => executor.execute(input), /PERSISTENCE/);
  assert.equal((await ledger.get(input.approvedFingerprint)).state, "uncertain");
  const replay = await executor.execute(input);
  assert.equal(replay.postRequests, 0); assert.equal(replay.quarantined, true); assert.equal(posts, 1);
});

test("uncertain operation can be reconciled by exact-ID GET without another POST", async () => {
  const input = prepared(); const ledger = new SyntheticLedger();
  await ledger.reserve({ fingerprint: input.approvedFingerprint, reviewId: input.review.id, siteId: input.siteId });
  let record = await ledger.get(input.approvedFingerprint);
  record = await ledger.transition(input.approvedFingerprint, record.version, "request_started", { createRequestCount: 1 });
  await ledger.transition(input.approvedFingerprint, record.version, "uncertain", { quarantined: true });
  const calls = [];
  const executor = new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method });
    return response(200, { draftPost: { id: "wix-draft-123", status: "DRAFT", ...input.wixDryRun.payload.draftPost } });
  } });
  const result = await executor.reconcile({ ...input, wixDraftId: "wix-draft-123" });
  assert.equal(result.status, "verified"); assert.equal(result.postRequests, 0); assert.deepEqual(calls.map((item) => item.method), ["GET"]);
  assert.equal((await ledger.get(input.approvedFingerprint)).reconciledWithoutCreate, true);
});

test("reconciliation rejects missing or conflicting IDs and never creates", async () => {
  const input = prepared(); const ledger = new SyntheticLedger();
  const reserved = await ledger.reserve({ fingerprint: input.approvedFingerprint, reviewId: input.review.id, siteId: input.siteId });
  await ledger.transition(input.approvedFingerprint, reserved.record.version, "uncertain", { wixDraftId: "known-id" });
  const executor = new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async () => { throw new Error("should not run"); } });
  await assert.rejects(() => executor.reconcile({ ...input, wixDraftId: "" }), /EXACT_ID/);
  await assert.rejects(() => executor.reconcile({ ...input, wixDraftId: "different-id" }), /ID_CONFLICT/);
});

test("failed retrieval or conflicting identity quarantines the known draft without another POST", async () => {
  for (const retrievedId of [null, "wrong-id"]) {
    const input = prepared(); const ledger = new SyntheticLedger(); let posts = 0;
    const executor = new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async (_url, options) => {
      if (options.method === "POST") { posts++; return response(200, { draftPost: { id: "wix-draft-123" } }); }
      return retrievedId ? response(200, { draftPost: { id: retrievedId, status: "DRAFT", ...input.wixDryRun.payload.draftPost } }) : response(500, {});
    } });
    await assert.rejects(() => executor.execute(input));
    const stored = await ledger.get(input.approvedFingerprint);
    assert.equal(stored.state, "uncertain"); assert.equal(stored.wixDraftId, "wix-draft-123"); assert.equal(posts, 1);
  }
});

test("published, changed content, changed headings and unexpected image all fail verification", async () => {
  for (const mutate of [
    (draft) => { draft.status = "PUBLISHED"; },
    (draft) => { draft.title = "Changed"; },
    (draft) => { draft.richContent.nodes.find((node) => node.type === "HEADING").nodes[0].textData.text = "Changed"; },
    (draft) => { draft.media = { wixMedia: { image: "unexpected" } }; },
  ]) {
    const input = prepared(); const ledger = new SyntheticLedger();
    const executor = new WixOneShotExecutor({ ledger, credentialSession: new SyntheticCredentialSession(), fetchImpl: async (_url, options) => {
      if (options.method === "POST") return response(200, { draftPost: { id: "wix-draft-123" } });
      const draft = structuredClone({ id: "wix-draft-123", status: "DRAFT", ...input.wixDryRun.payload.draftPost }); mutate(draft); return response(200, { draftPost: draft });
    } });
    await assert.rejects(() => executor.execute(input));
    assert.equal((await ledger.get(input.approvedFingerprint)).state, "uncertain");
  }
});

test("credential site mismatch fails before request and revocation failure is explicit", async () => {
  const input = prepared(); const mismatchLedger = new SyntheticLedger();
  await assert.rejects(() => new WixOneShotExecutor({ ledger: mismatchLedger, credentialSession: new SyntheticCredentialSession({ siteId: "wrong" }), fetchImpl: async () => { throw new Error("should not run"); } }).execute(input), /SITE_MISMATCH/);
  assert.equal((await mismatchLedger.get(input.approvedFingerprint)).state, "failed_before_request");
  const revokeLedger = new SyntheticLedger();
  await assert.rejects(() => new WixOneShotExecutor({ ledger: revokeLedger, credentialSession: new SyntheticCredentialSession({ revokeFails: true }), fetchImpl: successfulFetch(input.wixDryRun.payload, []) }).execute(input), /REVOCATION_UNVERIFIED/);
});

test("credential acquisition failure is recorded before any Wix request", async () => {
  const input = prepared(); const ledger = new SyntheticLedger(); let requests = 0;
  const credentialSession = { async acquire() { throw new Error("credential expired"); }, async revoke() {}, async isRevoked() { return true; } };
  const executor = new WixOneShotExecutor({ ledger, credentialSession, fetchImpl: async () => { requests++; throw new Error("should not run"); } });
  await assert.rejects(() => executor.execute(input), /credential expired/);
  assert.equal(requests, 0); assert.equal((await ledger.get(input.approvedFingerprint)).state, "failed_before_request");
});

test("receipts redact credentials and executor is isolated from recurring and Global Groove entrypoints", () => {
  assert.deepEqual(sanitizeExecutionRecord({ fingerprint: "x", credential: "secret", token: "secret", apiKey: "secret", authorization: "secret" }), { fingerprint: "x" });
  for (const file of ["src/engine.js", "src/cli.js", "src/job.js"]) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /wixOneShotExecutor|wixExecutionLedger/);
  }
  assert.equal(fs.existsSync(new URL("../../global-groove-automation", import.meta.url)), false);
});

test("Secret Manager session retrieves at runtime and requires verified revocation", async () => {
  const calls = []; let revoked = false;
  const sessionProvider = new SecretManagerWixCredentialSession({
    projectId: "synthetic-project", secretId: "temporary-wix-key", siteId: approvedGate4Candidate.siteId,
    accessTokenProvider: async () => "synthetic-google-token",
    fetchImpl: async (url, options) => { calls.push({ url, auth: options.headers.authorization }); return response(200, { payload: { data: Buffer.from("synthetic-wix-key").toString("base64") } }); },
    revokeCredential: async () => { revoked = true; }, verifyRevoked: async () => revoked,
  });
  const session = await sessionProvider.acquire();
  assert.equal(session.credential, "synthetic-wix-key"); assert.match(calls[0].url, /secretmanager\.googleapis\.com/);
  await sessionProvider.revoke(session); assert.equal(await sessionProvider.isRevoked(session), true);
  assert.doesNotMatch(JSON.stringify({ calls, session: { siteId: session.siteId, secretVersion: session.secretVersion } }), /synthetic-wix-key/);
});

test("Firestore ledger reserves with create-if-absent and transitions with update-time CAS", async () => {
  const fingerprint = approvedGate4Candidate.fingerprint; const calls = [];
  let stored = null; let updateTime = "2026-11-23T12:00:00.000Z";
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method });
    if (options.method === "GET") return stored ? response(200, { fields: stored.fields, updateTime }) : response(404, {});
    const body = JSON.parse(options.body);
    if (url.includes("currentDocument.exists=false")) { stored = body; return response(200, { fields: body.fields, updateTime }); }
    assert.match(url, /currentDocument\.updateTime=/); stored = body; updateTime = "2026-11-23T12:01:00.000Z"; return response(200, { fields: body.fields, updateTime });
  };
  const ledger = new FirestoreWixExecutionLedger({ projectId: "synthetic-project", accessToken: "synthetic-google-token", fetchImpl, now: () => "2026-11-23T12:00:00.000Z" });
  const reserved = await ledger.reserve({ fingerprint, reviewId: "review-1", siteId: approvedGate4Candidate.siteId });
  assert.equal(reserved.created, true); assert.match(calls[0].url, /currentDocument\.exists=false/);
  const transitioned = await ledger.transition(fingerprint, reserved.record.version, "request_started", { createRequestCount: 1 });
  assert.equal(transitioned.state, "request_started"); assert.equal(transitioned.version, 2);
});

test("Firestore duplicate reservation returns existing durable record", async () => {
  const fingerprint = approvedGate4Candidate.fingerprint;
  const existing = { fingerprint, state: "verified", version: 4, wixDraftId: "existing-id" };
  const encoded = { fields: { payloadJson: { stringValue: JSON.stringify(existing) } }, updateTime: "2026-11-23T12:00:00.000Z" };
  let calls = 0;
  const ledger = new FirestoreWixExecutionLedger({ projectId: "synthetic-project", accessToken: "synthetic-token", fetchImpl: async (_url, options = {}) => { calls++; return options.method === "PATCH" ? response(412, {}) : response(200, encoded); } });
  const result = await ledger.reserve({ fingerprint, reviewId: "review-1" });
  assert.equal(result.created, false); assert.equal(result.record.wixDraftId, "existing-id"); assert.equal(calls, 2);
});

