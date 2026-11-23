import fs from "node:fs";
import { transitionContentState } from "../src/gate4Content.js";
import { sha256 } from "../src/identity.js";
import { approvedGate4Candidate } from "../src/wixOneShotExecutor.js";
import { buildAttemptAuthorization, InMemoryWixAttemptStore } from "../src/wixAttemptLedger.js";
import { executeAuthorizedWixDraft } from "../src/wixAttemptRuntime.js";

const source = JSON.parse(fs.readFileSync(new URL("../docs/gate4-dry-run.json", import.meta.url), "utf8"));
const review = transitionContentState(source.articleReview, "approved_for_draft_creation", { approvedFingerprint: source.articleReview.contentFingerprint, at: "2026-11-23T20:00:00.000Z" });
const preparedInput = { review, wixDryRun: source.articleReview.wixDryRun, approvedFingerprint: approvedGate4Candidate.fingerprint, siteId: approvedGate4Candidate.siteId };
const store = new InMemoryWixAttemptStore({ now: incrementingClock() });
store.preserveLegacyRecord({ id: `wix-draft-execution-${approvedGate4Candidate.fingerprint}`, state: "uncertain", immutable: true });
await store.appendReconciliation({ reconciliationId: "synthetic-gate4e-cleanup-evidence", articleFingerprint: approvedGate4Candidate.fingerprint, siteId: approvedGate4Candidate.siteId, legacyRecordId: `wix-draft-execution-${approvedGate4Candidate.fingerprint}`, outcome: "reconciled_draft_removed", evidence: { draftIdHash: sha256("synthetic-removed-draft"), inventory: { drafts: 0, trash: 0 } } });
const authorization = buildAttemptAuthorization({ authorizationId: "gate4g-synthetic-auth-001", attemptId: "gate4g-synthetic-attempt-001", articleFingerprint: approvedGate4Candidate.fingerprint, transportChecksum: sha256(preparedInput.wixDryRun.payload), siteId: approvedGate4Candidate.siteId, authorizedAt: "2026-11-23T20:01:00.000Z", parentAttemptId: `wix-draft-execution-${approvedGate4Candidate.fingerprint}` });
store.addAuthorization(authorization);
const calls = [];
const credentialSession = syntheticCredentials();
const fetchImpl = async (url, options) => { calls.push(options.method); if (options.method === "POST") return response(200, { draftPost: { id: "synthetic-wix-draft-001" } }); return response(200, { draftPost: { id: "synthetic-wix-draft-001", status: "UNPUBLISHED", ...preparedInput.wixDryRun.payload.draftPost, media: { displayed: true, custom: false } } }); };
const first = await executeAuthorizedWixDraft({ store, authorization, parentAttemptId: authorization.parentAttemptId, seoSlug: preparedInput.wixDryRun.payload.draftPost.seoSlug, credentialSession, preparedInput, fetchImpl });
const second = await executeAuthorizedWixDraft({ store, authorization, parentAttemptId: authorization.parentAttemptId, seoSlug: preparedInput.wixDryRun.payload.draftPost.seoSlug, credentialSession, preparedInput, fetchImpl });
const attempt = await store.getAttempt(authorization.attemptId);
const article = await store.getArticleByFingerprint(authorization.articleFingerprint, authorization.siteId);
process.stdout.write(`${JSON.stringify({ mode: "synthetic_only", first, replay: second, calls, attempt, article, liveWixRequests: 0 }, null, 2)}\n`);

function response(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }
function syntheticCredentials() { return { revoked: false, lastSession: null, async acquire() { this.lastSession = { credential: "synthetic-never-log", siteId: approvedGate4Candidate.siteId }; return this.lastSession; }, async revoke() { this.revoked = true; }, async isRevoked() { return this.revoked; } }; }
function incrementingClock() { let i = 0; return () => `2026-11-23T20:${String(i++).padStart(2, "0")}:00.000Z`; }
