import { metadataAccessToken } from "./googleAuth.js";
import { FirestoreInterfaceReader } from "./firestoreReadClient.js";
import { FirestoreRestTransactionClient } from "./wixAttemptLedger.js";
import { FirestorePublisherStore } from "./publisherStore.js";
import { FirestoreAutopilotExecutionLedger } from "./autopilotExecutionLedger.js";
import { runPublisherPipeline } from "./publisherOrchestrator.js";
import { generateProductionArticle } from "./vertexArticleGenerator.js";
import { loadBundledCreativeStudioRegistry, verifyCreativeStudioProductionAccess } from "./creativeStudioProduction.js";
import { executeGeneralizedWixPublication } from "./generalizedWixPublisher.js";

const PROJECT = "crm2026-497707";
const SITE_ID = "fe9762c6-cdbd-404c-ba42-c2b834b052e2";
const approvedBusinessFacts = Object.freeze([
  "Allround DJ Elvio heeft meer dan 20 jaar ervaring als DJ.",
  "De muzikale invulling wordt per aanvraag afgestemd op het evenement, de locatie en de gasten.",
  "Afhankelijk van de aanvraag is DJ-only of een complete drive-in met professioneel geluid en licht mogelijk.",
  "Beschikbaarheid en de exacte uitvoering worden altijd per aanvraag bevestigd.",
]);

async function readJson(url, token) { const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error(`PUBLISHER_READ_HTTP_${response.status}`); return response.json(); }

async function latestSnapshot({ projectId, token, bucket }) {
  const reader = new FirestoreInterfaceReader({ projectId, accessTokenProvider: async () => token, maxRecords: 100 });
  const executions = await reader.list("executions", { limit: 100 });
  const latest = executions.filter((item) => item.snapshotObject).sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))[0];
  if (!latest) throw new Error("PUBLISHER_SNAPSHOT_NOT_FOUND");
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(latest.snapshotObject)}?alt=media`;
  return { latest, snapshot: await readJson(url, token) };
}

async function secretValue({ projectId, name, token }) {
  const payload = await readJson(`https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(name)}/versions/latest:access`, token);
  if (!payload.payload?.data) throw new Error("PUBLISHER_SECRET_EMPTY");
  return Buffer.from(payload.payload.data, "base64").toString("utf8").trim();
}

async function wixInventory(credential) {
  const response = await fetch("https://www.wixapis.com/blog/v3/posts/query", { method: "POST", headers: { authorization: credential, "wix-site-id": SITE_ID, "content-type": "application/json" }, body: JSON.stringify({ query: { paging: { limit: 100 } }, fieldsets: ["URL"] }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`PUBLISHER_WIX_INVENTORY_HTTP_${response.status}`);
  const payload = await response.json();
  return (payload.posts || []).map((item) => ({ id: item.id, title: item.title, slug: item.seoSlug || item.slug, url: item.url, body: "" }));
}

async function storageObjectBytes({ bucket, objectName, token }) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`PUBLISHER_ASSET_HTTP_${response.status}`); return Buffer.from(await response.arrayBuffer());
}

export async function runProductionPublisher({ env = process.env, now = new Date(), tokenProvider = metadataAccessToken, fetchImpl = fetch } = {}) {
  const projectId = env.GOOGLE_CLOUD_PROJECT || PROJECT; const bucket = env.SEO_STORAGE_BUCKET || `${projectId}-elvio-seo-ai`;
  const mode = env.BLOG_AUTOPILOT_MODE || "readiness"; const killSwitch = String(env.BLOG_AUTOPILOT_KILL_SWITCH ?? "true").toLowerCase() !== "false";
  const token = await tokenProvider();
  const { latest, snapshot } = await latestSnapshot({ projectId, token, bucket });
  const credential = await secretValue({ projectId, name: env.WIX_PUBLISHER_SECRET || "elvio-seo-wix-publisher", token });
  const existingContent = await wixInventory(credential);
  const assets = loadBundledCreativeStudioRegistry();
  const creative = await verifyCreativeStudioProductionAccess({ records: assets, bucket, objectPrefix: env.CREATIVE_STUDIO_OBJECT_PREFIX, accessToken: token, fetchImpl });
  if (creative.status !== "available") throw new Error("PUBLISHER_CREATIVE_STUDIO_UNAVAILABLE");
  const client = new FirestoreRestTransactionClient({ projectId, accessToken: token, fetchImpl });
  const store = new FirestorePublisherStore({ client });
  const ledger = new FirestoreAutopilotExecutionLedger({ client });
  const incidentReader = new FirestoreInterfaceReader({ projectId, accessTokenProvider: async () => token, maxRecords: 100, fetchImpl });
  const incidentHistory = await incidentReader.list("publisher_incidents_v1", { limit: 100 });
  const unresolved = unresolvedIncidents(incidentHistory);
  const effectiveKillSwitch = killSwitch || (mode !== "readiness" && unresolved.length > 0);
  const generate = (opportunity) => generateProductionArticle({ opportunity, approvedBusinessFacts, accessTokenProvider: async () => token, projectId, fetchImpl, model: env.BLOG_GENERATION_MODEL || "gemini-3.8-flash" });
  const publish = async ({ candidate, draft, image, ...context }) => {
    const objectName = `${String(env.CREATIVE_STUDIO_OBJECT_PREFIX || "elvio-seo-ai/creative-studio/approved-assets").replace(/\/$/, "")}/${image.fileName}`;
    const imageBytes = await storageObjectBytes({ bucket, objectName, token });
    return executeGeneralizedWixPublication({ candidate, draft, image, imageBytes, credential, ledger, killSwitch, fetchImpl, ...context });
  };
  try {
    const result = await runPublisherPipeline({
      evidence: snapshot.evidence || [], existingContent, assets, sourceFingerprint: latest.snapshotChecksum,
      mode, killSwitch: effectiveKillSwitch, now, generate, publish,
      runtimeHealth: { credentialHealth: "verified_runtime_access", creativeStudioHealth: "verified", sourceEvidenceHealth: "verified", unresolvedCriticalIncidentCount: unresolved.length },
      persistEvent: (event) => store.persistEvent(event), persistExecution: (execution) => store.persistExecution(execution),
    });
    if (result.status === "completed_no_publication") {
      for (const incident of unresolved.filter((item) => recoverableRuntimeIncident(item.code))) {
        await store.persistIncident({ state: "resolved", code: incident.code, resolvesIncidentId: incident.id || null, createdAt: now.toISOString(), killSwitchRequired: false });
      }
    }
    return { ...result, sourceSnapshot: latest.snapshotObject, sourceChecksum: latest.snapshotChecksum, model: env.BLOG_GENERATION_MODEL || "gemini-3.8-flash", creativeAssetsVerified: creative.verifiedAssets, configuredKillSwitch: killSwitch, killSwitch: effectiveKillSwitch, siteId: SITE_ID };
  } catch (error) {
    await store.persistIncident({ state: "open", code: sanitizeIncidentCode(error), createdAt: now.toISOString(), killSwitchRequired: true });
    throw error;
  }
}

function unresolvedIncidents(records = []) {
  const latest = new Map();
  for (const item of [...records].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))) if (item.code) latest.set(item.code, item);
  return [...latest.values()].filter((item) => item.state === "open" && item.killSwitchRequired === true);
}

function recoverableRuntimeIncident(code) {
  return /^(VERTEX_|PUBLISHER_(CREATIVE_STUDIO|SNAPSHOT|SECRET|READ))/i.test(String(code || ""));
}

export function sanitizeIncidentCode(error) {
  const message = String(error?.message || "PUBLISHER_UNKNOWN_FAILURE");
  if (/abort|timeout/i.test(message)) return "VERTEX_GENERATION_TIMEOUT";
  const value = message.toUpperCase();
  return /^[A-Z0-9_:-]{1,120}$/.test(value) ? value : "PUBLISHER_SANITIZED_FAILURE";
}

if (process.argv[1] && new URL(import.meta.url).pathname.replace(/^\/(.:\/)/, "$1") === process.argv[1].replaceAll("\\", "/")) {
  runProductionPublisher().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(JSON.stringify({ status: "failed", reason: error.message })); process.exitCode = 1; });
}

