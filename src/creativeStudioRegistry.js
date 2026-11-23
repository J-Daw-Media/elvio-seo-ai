const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);
const registryStates = new Set(["candidate", "pending_owner_approval", "approved", "rejected"]);

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateCreativeAsset(record = {}) {
  const errors = [];
  if (!asTrimmedString(record.assetId)) errors.push("asset_id_required");
  if (!asTrimmedString(record.driveFileId)) errors.push("drive_file_id_required");
  if (!asTrimmedString(record.sourceFolderId)) errors.push("source_folder_required");
  if (!asTrimmedString(record.fileName)) errors.push("file_name_required");
  if (!allowedMimeTypes.has(record.mimeType)) errors.push("unsupported_mime_type");
  if (!Number.isInteger(record.width) || record.width <= 0) errors.push("width_required");
  if (!Number.isInteger(record.height) || record.height <= 0) errors.push("height_required");
  if (!asTrimmedString(record.provenance)) errors.push("provenance_required");
  if (!asTrimmedString(record.checksum)) errors.push("checksum_required");
  if (!asTrimmedString(record.altText)) errors.push("alt_text_required");
  if (!registryStates.has(record.status)) errors.push("registry_status_invalid");

  if (record.status === "approved") {
    if (record.rightsVerified !== true) errors.push("rights_not_verified");
    if (record.privacyStatus !== "cleared") errors.push("privacy_not_cleared");
    if (!record.ownerApproval?.approvedAt || !record.ownerApproval?.approvalRef) errors.push("owner_approval_required");
    if (record.active !== true || record.trashed === true || record.revoked === true) errors.push("asset_not_active");
  }

  return { valid: errors.length === 0, errors };
}

export function selectApprovedAsset(records = [], { topicTags = [] } = {}) {
  const eligible = records.filter((item) => item.status === "approved" && validateCreativeAsset(item).valid);
  const ranked = eligible
    .map((item) => ({ ...item, score: (item.tags || []).filter((tag) => topicTags.includes(tag)).length }))
    .sort((a, b) => b.score - a.score || (a.reuseCount || 0) - (b.reuseCount || 0) || a.assetId.localeCompare(b.assetId));
  return ranked[0] ? { available: true, asset: ranked[0] } : { available: false, reason: "approved_asset_unavailable" };
}

export function validateAssetRegistry(records = []) {
  const duplicateDriveIds = [];
  const duplicateChecksums = [];
  const seenDriveIds = new Set();
  const seenChecksums = new Set();
  const entries = records.map((record) => {
    if (record.driveFileId && seenDriveIds.has(record.driveFileId)) duplicateDriveIds.push(record.driveFileId);
    if (record.checksum && seenChecksums.has(record.checksum)) duplicateChecksums.push(record.checksum);
    if (record.driveFileId) seenDriveIds.add(record.driveFileId);
    if (record.checksum) seenChecksums.add(record.checksum);
    return { assetId: record.assetId || null, status: record.status || null, ...validateCreativeAsset(record) };
  });
  const usable = records.filter((record) => selectApprovedAsset([record]).available).length;
  return {
    usable,
    total: records.length,
    empty: records.length === 0,
    valid: entries.every((entry) => entry.valid) && duplicateDriveIds.length === 0 && duplicateChecksums.length === 0,
    duplicateDriveIds: [...new Set(duplicateDriveIds)],
    duplicateChecksums: [...new Set(duplicateChecksums)],
    entries,
  };
}

export { allowedMimeTypes, registryStates };
