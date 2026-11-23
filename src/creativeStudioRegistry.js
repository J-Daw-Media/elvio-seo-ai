export function selectApprovedAsset(records = [], { topicTags = [] } = {}) {
  const eligible = records.filter((item) => item.status === "approved" && item.rightsVerified === true && item.provenance && item.driveFileId && item.mimeType?.startsWith("image/") && !item.revoked);
  const ranked = eligible.map((item) => ({ ...item, score: (item.tags || []).filter((tag) => topicTags.includes(tag)).length })).sort((a, b) => b.score - a.score || (a.reuseCount || 0) - (b.reuseCount || 0) || a.driveFileId.localeCompare(b.driveFileId));
  return ranked[0] ? { available: true, asset: ranked[0] } : { available: false, reason: "approved_asset_unavailable" };
}

export function validateAssetRegistry(records = []) {
  return { usable: records.filter((r) => selectApprovedAsset([r]).available).length, total: records.length, empty: records.length === 0 };
}
