import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { metadataAccessToken } from "./googleAuth.js";
import { FirestoreInterfaceReader } from "./firestoreReadClient.js";
import { SeoInterfaceReadModel } from "./interfaceReadModel.js";

const CACHE_TTL_MS = 300_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=300", ...headers });
  res.end(JSON.stringify(body));
};

const tokenMatches = (received, expected) => {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createInterfaceHandler({ expectedToken, readModel, now = () => Date.now() } = {}) {
  if (!expectedToken || !readModel) throw new Error("SEO_INTERFACE_SERVER_CONFIGURATION_REQUIRED");
  let cache = null;
  const rates = new Map();
  return async (req, res) => {
    const authorization = String(req.headers.authorization || "");
    if (!tokenMatches(authorization.startsWith("Bearer ") ? authorization.slice(7) : "", expectedToken)) return json(res, 401, { error: "Unauthorized" });
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" }, { allow: "GET" });
    const url = new URL(req.url || "/", "https://internal.invalid");
    if (url.pathname !== "/v1/seo-intelligence") return json(res, 404, { error: "Not found" });
    const key = String(req.socket?.remoteAddress || "unknown");
    const current = now();
    const rate = rates.get(key);
    if (!rate || current - rate.startedAt >= RATE_WINDOW_MS) rates.set(key, { startedAt: current, count: 1 });
    else if (++rate.count > RATE_LIMIT) return json(res, 429, { error: "Rate limit exceeded" }, { "retry-after": "60" });
    try {
      if (!cache || current - cache.createdAt >= CACHE_TTL_MS) {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
        cache = { createdAt: current, value: await readModel.read({ now: new Date(current).toISOString(), page: { opportunities: { limit }, technicalFindings: { limit }, contentBriefs: { limit }, reviews: { limit } } }) };
      }
      return json(res, 200, cache.value);
    } catch (error) {
      console.error("SEO interface read unavailable", { code: error?.message });
      return json(res, 503, { error: "SEO evidence unavailable", state: "unavailable" });
    }
  };
}

export function startInterfaceServer(env = process.env) {
  const reader = new FirestoreInterfaceReader({ projectId: env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT, accessTokenProvider: () => metadataAccessToken(), maxRecords: 100 });
  const readModel = new SeoInterfaceReadModel({ reader, maxRecords: 100 });
  const handler = createInterfaceHandler({ expectedToken: env.SEO_INTERFACE_TOKEN, readModel });
  return http.createServer(handler).listen(Number(env.PORT || 8080));
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll("\\", "/"))) startInterfaceServer();
