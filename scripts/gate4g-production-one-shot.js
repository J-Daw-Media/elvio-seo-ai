import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { transitionContentState } from "../src/gate4Content.js";
import { approvedGate4Candidate } from "../src/wixOneShotExecutor.js";
import { FirestoreRestTransactionClient, FirestoreWixAttemptStore } from "../src/wixAttemptLedger.js";
import { SecretManagerWixCredentialSession } from "../src/wixCredentialSession.js";
import { executeAuthorizedWixDraft } from "../src/wixAttemptRuntime.js";

if (process.env.GATE4G_EXECUTION_ENABLED !== "true") throw new Error("GATE4G_EXECUTION_DISABLED");
const required = ["GCP_PROJECT", "WIX_SECRET_ID", "WIX_SECRET_VERSION", "WIX_AUTHORIZATION_ID", "WIX_ATTEMPT_ID", "WIX_PARENT_ATTEMPT_ID", "WIX_CREDENTIAL_OPERATIONS_MODULE"];
for (const name of required) if (!process.env[name]) throw new Error(`GATE4G_CONFIGURATION_MISSING_${name}`);

const source = JSON.parse(fs.readFileSync(new URL("../docs/gate4-dry-run.json", import.meta.url), "utf8"));
const review = transitionContentState(source.articleReview, "approved_for_draft_creation", { approvedFingerprint: source.articleReview.contentFingerprint, at: new Date().toISOString() });
const preparedInput = { review, wixDryRun: source.articleReview.wixDryRun, approvedFingerprint: approvedGate4Candidate.fingerprint, siteId: approvedGate4Candidate.siteId };
const tokenProvider = async () => {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`GATE4G_METADATA_AUTH_HTTP_${response.status}`);
  return (await response.json()).access_token;
};
const accessToken = await tokenProvider();
const client = new FirestoreRestTransactionClient({ projectId: process.env.GCP_PROJECT, accessToken });
const store = new FirestoreWixAttemptStore({ client });
const authorizationPath = client.path("seo_wix_authorizations", process.env.WIX_AUTHORIZATION_ID);
const authorization = (await client.get(authorizationPath))?.payload;
if (!authorization || authorization.attemptId !== process.env.WIX_ATTEMPT_ID) throw new Error("GATE4G_AUTHORIZATION_NOT_FOUND");
const operations = await import(pathToFileURL(process.env.WIX_CREDENTIAL_OPERATIONS_MODULE).href);
if (typeof operations.revokeCredential !== "function" || typeof operations.verifyRevoked !== "function") throw new Error("GATE4G_REVOCATION_OPERATIONS_REQUIRED");
const credentialSession = new SecretManagerWixCredentialSession({ projectId: process.env.GCP_PROJECT, secretId: process.env.WIX_SECRET_ID, version: process.env.WIX_SECRET_VERSION, siteId: approvedGate4Candidate.siteId, accessTokenProvider: tokenProvider, revokeCredential: operations.revokeCredential, verifyRevoked: operations.verifyRevoked });
const result = await executeAuthorizedWixDraft({ store, authorization, parentAttemptId: process.env.WIX_PARENT_ATTEMPT_ID, seoSlug: preparedInput.wixDryRun.payload.draftPost.seoSlug, credentialSession, preparedInput });
process.stdout.write(`${JSON.stringify({ status: result.status, postRequests: result.postRequests, wixDraftId: result.wixDraftId, replayBlocked: Boolean(result.replayBlocked) })}\n`);
