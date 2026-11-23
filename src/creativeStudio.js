import { stableId } from "./identity.js";

const ALLOWED_RIGHTS = new Set(["owned", "licensed", "owner_approved"]);
export function validateCreativeAsset(asset = {}) {
  const errors = [];
  if (!asset.assetId || !asset.url) errors.push("identity_missing");
  if (!ALLOWED_RIGHTS.has(asset.rightsStatus)) errors.push("rights_unverified");
  if (!asset.provenance) errors.push("provenance_missing");
  if (asset.fabricatedEventPhotography) errors.push("fabricated_event_photography_rejected");
  return { valid: errors.length === 0, errors };
}
export function recommendAssets({ assets = [], eventCategory, brief } = {}) {
  return assets.filter((asset) => validateCreativeAsset(asset).valid)
    .filter((asset) => !eventCategory || (asset.categories || []).includes(eventCategory))
    .map((asset) => ({
      id: stableId("creative-recommendation", { assetId: asset.assetId, briefId: brief?.id }), assetId: asset.assetId,
      sourceUrl: asset.url, provenance: asset.provenance, rightsStatus: asset.rightsStatus,
      altText: asset.altText || `Allround DJ Elvio bij een ${eventCategory === "wedding" ? "bruiloft" : "evenement"}`,
      caption: asset.caption || null, ownerApprovalRequired: true, uploadAllowed: false,
    }));
}

export function selectAutopilotAsset({ assets = [], eventCategory, brief, priorUsage = [], maxReuse = 2 } = {}) {
  const usage = new Map(priorUsage.map((item) => [item.assetId, Number(item.count) || 0]));
  const candidates = recommendAssets({ assets, eventCategory, brief })
    .filter((asset) => (usage.get(asset.assetId) || 0) < maxReuse)
    .filter((asset) => /^https:\/\//.test(asset.sourceUrl) && /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(asset.sourceUrl))
    .map((asset) => ({ ...asset, altText: String(asset.altText || "").trim(), reuseCount: usage.get(asset.assetId) || 0 }))
    .filter((asset) => asset.altText.length >= 10)
    .sort((a, b) => a.reuseCount - b.reuseCount || a.assetId.localeCompare(b.assetId));
  const selected = candidates[0] || null;
  return selected ? { eligible: true, selected, reason: "approved_first_party_asset" } : { eligible: false, selected: null, reason: "no_eligible_approved_asset" };
}
