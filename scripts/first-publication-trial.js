import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";
import { buildFirstPublicationAuthorization, executeFirstPublicationTrial, FirestoreFirstPublicationLedger } from "../src/firstPublicationTrial.js";
import { FirestoreRestTransactionClient } from "../src/wixAttemptLedger.js";
import { SecretManagerWixCredentialSession } from "../src/wixCredentialSession.js";
import { verifyRetrievedDraft } from "../src/wixOneShotExecutor.js";
import { verifyPublicArticle } from "../src/publicPageVerification.js";

if (process.env.FIRST_PUBLICATION_EXECUTION_ENABLED !== "true") throw new Error("FIRST_PUBLICATION_EXECUTION_DISABLED");
const required = ["GCP_PROJECT", "WIX_SECRET_ID", "WIX_SECRET_VERSION", "WIX_CREDENTIAL_OPERATIONS_MODULE", "FIRST_PUBLICATION_AUTHORIZATION_ID", "FIRST_PUBLICATION_ATTEMPT_ID", "FIRST_PUBLICATION_APPROVED_AT", "FIRST_PUBLICATION_IMAGE_PATH"];
for (const name of required) if (!process.env[name]) throw new Error(`FIRST_PUBLICATION_CONFIGURATION_MISSING_${name}`);

const packageData = buildFirstPublicationPackage();
const imageBytes = fs.readFileSync(process.env.FIRST_PUBLICATION_IMAGE_PATH);
const authorization = buildFirstPublicationAuthorization({ authorizationId: process.env.FIRST_PUBLICATION_AUTHORIZATION_ID, attemptId: process.env.FIRST_PUBLICATION_ATTEMPT_ID, approvedAt: process.env.FIRST_PUBLICATION_APPROVED_AT });
const tokenProvider = async () => {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`FIRST_PUBLICATION_METADATA_AUTH_HTTP_${response.status}`);
  return (await response.json()).access_token;
};
const accessToken = await tokenProvider();
const client = new FirestoreRestTransactionClient({ projectId: process.env.GCP_PROJECT, accessToken });
const ledger = new FirestoreFirstPublicationLedger({ client });
const operations = await import(pathToFileURL(process.env.WIX_CREDENTIAL_OPERATIONS_MODULE).href);
if (typeof operations.revokeCredential !== "function" || typeof operations.verifyRevoked !== "function") throw new Error("FIRST_PUBLICATION_REVOCATION_OPERATIONS_REQUIRED");
const credentialSession = new SecretManagerWixCredentialSession({ projectId: process.env.GCP_PROJECT, secretId: process.env.WIX_SECRET_ID, version: process.env.WIX_SECRET_VERSION, siteId: packageData.wix.siteId, accessTokenProvider: tokenProvider, revokeCredential: operations.revokeCredential, verifyRevoked: operations.verifyRevoked });
const verifyDraft = async (draft, context) => {
  if (context.stage === "pre_update") {
    const status = String(draft?.status || "").toUpperCase();
    return { verified: draft?.id === context.expectedId && ["DRAFT", "UNPUBLISHED"].includes(status), exactId: draft?.id === context.expectedId, unpublished: ["DRAFT", "UNPUBLISHED"].includes(status) };
  }
  const verification = verifyRetrievedDraft(draft, context.expectedPayload, context.expectedId, packageData.wix.siteId);
  return { verified: true, ...verification };
};
const verifyPublic = async ({ expectedUrl, image }) => verifyPublicArticle({ url: expectedUrl, expected: { seoTitle: packageData.article.seoTitle, canonicalUrl: expectedUrl, h1: packageData.article.h1, ctaUrl: "https://www.djelvio.nl/contact", imageIdentity: image.fileId } });

const result = await executeFirstPublicationTrial({ packageData, authorization, ledger, credentialSession, imageBytes, verifyDraft, verifyPublic, killSwitch: false });
process.stdout.write(`${JSON.stringify({ status: result.status, publicUrl: result.publicUrl, wixPostId: result.wixPostId, replayBlocked: result.replayBlocked, requestCounts: result.requestCounts })}\n`);
