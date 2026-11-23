import fs from "node:fs";
import { validateAssetRegistry } from "./creativeStudioRegistry.js";

const defaultRegistryUrl = new URL("../docs/creative-studio-approved-assets-2026-11-23.json", import.meta.url);

export function loadBundledCreativeStudioRegistry({ registryUrl = defaultRegistryUrl } = {}) {
  const records = JSON.parse(fs.readFileSync(registryUrl, "utf8"));
  const validation = validateAssetRegistry(records);
  if (!validation.valid || validation.usable !== records.length || records.length !== 12) throw new Error("CREATIVE_STUDIO_REGISTRY_INVALID");
  return records;
}

export async function verifyCreativeStudioProductionAccess({
  records = loadBundledCreativeStudioRegistry(),
  bucket,
  objectPrefix = "elvio-seo-ai/creative-studio/approved-assets",
  accessToken,
  fetchImpl = fetch,
} = {}) {
  if (!bucket || !accessToken) return { status: "unavailable", verifiedAssets: 0, expectedAssets: records.length, reason: "creative_studio_storage_access_missing", writesPerformed: 0 };
  const results = [];
  for (const record of records) {
    const objectName = `${objectPrefix.replace(/\/$/, "")}/${record.fileName}`;
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      results.push({ assetId: record.assetId, accessible: false, checksumVerified: false, reason: `storage_http_${response.status}` });
      continue;
    }
    const metadata = await response.json();
    const checksumVerified = metadata.metadata?.sha256 === record.checksum;
    results.push({ assetId: record.assetId, accessible: true, checksumVerified, objectName, generation: metadata.generation || null });
  }
  const verifiedAssets = results.filter((item) => item.accessible && item.checksumVerified).length;
  return {
    status: verifiedAssets === records.length ? "available" : "incomplete",
    verifiedAssets,
    expectedAssets: records.length,
    duplicateDriveIds: validateAssetRegistry(records).duplicateDriveIds,
    duplicateChecksums: validateAssetRegistry(records).duplicateChecksums,
    writesPerformed: 0,
    results,
  };
}
