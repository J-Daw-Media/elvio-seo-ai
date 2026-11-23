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
