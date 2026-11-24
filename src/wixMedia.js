const GENERATE = "https://www.wixapis.com/site-media/v1/files/generate-upload-url";
const GET_FILE = "https://www.wixapis.com/site-media/v1/files/get-file-by-id";

export function assertWixMediaEndpoint(url, method) {
  if (url !== GENERATE || String(method).toUpperCase() !== "POST") throw new Error("WIX_MEDIA_ENDPOINT_NOT_ALLOWED");
  return true;
}

export async function uploadVerifiedImage({ fetchImpl = fetch, credential, siteId, bytes, fileName, mimeType, timeoutMs = 15000, maxReadyChecks = 6, pollDelayMs = 1500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (!credential || !siteId || !bytes || !fileName || !mimeType?.startsWith("image/")) throw new Error("WIX_MEDIA_INPUT_REQUIRED");
  assertWixMediaEndpoint(GENERATE, "POST");
  const headers = { authorization: credential, "wix-site-id": siteId, "content-type": "application/json" };
  const generated = await timed(fetchImpl, GENERATE, { method: "POST", headers, body: JSON.stringify({ mimeType, fileName }) }, timeoutMs);
  if (!generated.ok) throw new Error(`WIX_MEDIA_URL_HTTP_${generated.status}`);
  const data = await generated.json();
  const uploadUrl = data.uploadUrl || data.uploadUrlInfo?.uploadUrl;
  if (!uploadUrl || new URL(uploadUrl).protocol !== "https:") throw new Error("WIX_MEDIA_UPLOAD_URL_INVALID");
  const uploaded = await timed(fetchImpl, uploadUrl, { method: "PUT", headers: { "content-type": mimeType }, body: bytes }, timeoutMs);
  if (!uploaded.ok) throw new Error(`WIX_MEDIA_UPLOAD_HTTP_${uploaded.status}`);
  const result = await uploaded.json();
  let file = result.file || result;
  if (!file.id) throw new Error("WIX_MEDIA_VERIFICATION_FAILED");
  for (let check = 0; mediaState(file) !== "READY" && check < maxReadyChecks; check += 1) {
    if (["FAILED", "ERROR"].includes(mediaState(file))) throw new Error("WIX_MEDIA_PROCESSING_FAILED");
    if (check > 0 || pollDelayMs > 0) await sleep(pollDelayMs);
    const descriptorUrl = `${GET_FILE}?fileId=${encodeURIComponent(file.id)}`;
    const descriptor = await timed(fetchImpl, descriptorUrl, { method: "GET", headers: { authorization: credential, "wix-site-id": siteId } }, timeoutMs);
    if (!descriptor.ok) throw new Error(`WIX_MEDIA_DESCRIPTOR_HTTP_${descriptor.status}`);
    const descriptorBody = await descriptor.json();
    file = descriptorBody.file || descriptorBody;
  }
  if (mediaState(file) !== "READY" || !String(file.mimeType || mimeType).startsWith("image/")) throw new Error("WIX_MEDIA_READY_TIMEOUT");
  return { fileId: file.id, mediaUrl: file.url || file.media?.image?.url || null, state: "READY" };
}

function mediaState(file) {
  return String(file?.operationStatus || file?.state || file?.status || "").toUpperCase();
}

async function timed(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
}
