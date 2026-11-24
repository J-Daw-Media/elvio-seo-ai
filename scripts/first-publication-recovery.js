import { buildFirstPublicationPackage } from "../src/firstPublicationPackage.js";
import { buildFirstPublicationAuthorization, FirestoreFirstPublicationLedger } from "../src/firstPublicationTrial.js";
import { recoverFirstPublication } from "../src/firstPublicationRecovery.js";
import { FirestoreRestTransactionClient } from "../src/wixAttemptLedger.js";
import { verifyRetrievedDraft } from "../src/wixOneShotExecutor.js";
import { verifyPublicArticle } from "../src/publicPageVerification.js";

const required = ["GCP_PROJECT", "WIX_PERSISTENT_SECRET_ID", "FIRST_PUBLICATION_RECOVERY_AUTHORIZATION_ID", "FIRST_PUBLICATION_RECOVERY_ATTEMPT_ID", "FIRST_PUBLICATION_RECOVERY_APPROVED_AT"];
for (const name of required) if (!process.env[name]) throw new Error(`FIRST_PUBLICATION_RECOVERY_CONFIGURATION_MISSING_${name}`);
if (process.env.FIRST_PUBLICATION_RECOVERY_ENABLED !== "true") throw new Error("FIRST_PUBLICATION_RECOVERY_DISABLED");

const tokenProvider = async () => {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`FIRST_PUBLICATION_RECOVERY_METADATA_AUTH_HTTP_${response.status}`);
  return (await response.json()).access_token;
};
const googleToken = await tokenProvider();
const secretName = `projects/${process.env.GCP_PROJECT}/secrets/${process.env.WIX_PERSISTENT_SECRET_ID}/versions/latest`;
const secretResponse = await fetch(`https://secretmanager.googleapis.com/v1/${secretName}:access`, { headers: { authorization: `Bearer ${googleToken}` } });
if (!secretResponse.ok) throw new Error(`FIRST_PUBLICATION_RECOVERY_SECRET_HTTP_${secretResponse.status}`);
const credential = Buffer.from((await secretResponse.json()).payload.data, "base64").toString("utf8").trim();

const packageData = buildFirstPublicationPackage();
const authorization = buildFirstPublicationAuthorization({ authorizationId: process.env.FIRST_PUBLICATION_RECOVERY_AUTHORIZATION_ID, attemptId: process.env.FIRST_PUBLICATION_RECOVERY_ATTEMPT_ID, approvedAt: process.env.FIRST_PUBLICATION_RECOVERY_APPROVED_AT });
const client = new FirestoreRestTransactionClient({ projectId: process.env.GCP_PROJECT, accessToken: googleToken });
const originalLedger = new FirestoreFirstPublicationLedger({ client });
const recoveryLedger = new FirestoreFirstPublicationLedger({ client, collection: "seo_wix_first_publication_recoveries" });
const verifyDraft = async (draft, context) => {
  if (context.stage === "pre_update") { const status = String(draft?.status || "").toUpperCase(); return { verified: draft?.id === context.expectedId && ["DRAFT", "UNPUBLISHED"].includes(status) }; }
  return { verified: true, ...verifyRetrievedDraft(draft, context.expectedPayload, context.expectedId, packageData.wix.siteId) };
};
const verifyPublic = async ({ expectedUrl, image }) => verifyPublicArticle({ url: expectedUrl, expected: { seoTitle: packageData.article.seoTitle, canonicalUrl: expectedUrl, h1: packageData.article.h1, ctaUrl: "https://www.djelvio.nl/contact", imageIdentity: image.id } });
const result = await recoverFirstPublication({ packageData, authorization, originalLedger, recoveryLedger, credential, verifyDraft, verifyPublic });
process.stdout.write(`${JSON.stringify({ status: result.status, publicUrl: result.publicUrl, wixPostId: result.wixPostId, replayBlocked: result.replayBlocked, requestCounts: result.requestCounts })}\n`);
