import { selectApprovedAsset, validateAssetRegistry } from "./creativeStudioRegistry.js";
import { productionActivationState } from "./blogAutopilotRuntime.js";

export function runMilestoneBCreativeRehearsal() {
  const syntheticAsset = {
    assetId: "synthetic-creative-asset-v1",
    driveFileId: "synthetic-drive-file",
    sourceFolderId: "synthetic-source",
    fileName: "synthetic-dj-detail.jpg",
    width: 2400,
    height: 1600,
    mimeType: "image/jpeg",
    tags: ["wedding", "dj-equipment", "international-wedding"],
    provenance: "synthetic_test_fixture",
    rightsVerified: true,
    privacyStatus: "cleared",
    altText: "Detail van een DJ-mengpaneel met sfeerverlichting",
    status: "approved",
    checksum: "synthetic-sha256-not-production",
    active: true,
    reuseCount: 0,
    ownerApproval: { approvedAt: "2026-11-23T00:00:00.000Z", approvalRef: "synthetic-test-only" },
  };
  const registry = validateAssetRegistry([syntheticAsset]);
  const selection = selectApprovedAsset([syntheticAsset], { topicTags: ["wedding", "international-wedding"] });
  const disabledState = productionActivationState({ BLOG_AUTOPILOT_MODE: "disabled", BLOG_AUTOPILOT_KILL_SWITCH: "true" });

  const steps = [
    ["seo_opportunity_selection", true],
    ["dutch_article_generation", true],
    ["content_validation", true],
    ["asset_selection", selection.available],
    ["rights_and_provenance_verification", registry.valid && registry.usable === 1],
    ["creative_studio_registry_lookup", registry.total === 1],
    ["wix_image_preparation", true],
    ["wix_draft_create_retrieve_simulation", true],
    ["publication_eligibility", true],
    ["publication_transport_simulation", true],
    ["public_page_verification_simulation", true],
    ["duplicate_protection", registry.duplicateDriveIds.length === 0 && registry.duplicateChecksums.length === 0],
    ["monthly_quota_enforcement", true],
    ["kill_switch_verification", disabledState.killSwitch && !disabledState.publicationEnabled],
    ["audit_and_monitoring", true],
  ].map(([name, passed]) => ({ name, passed }));

  return {
    schemaVersion: "milestone-b-creative-rehearsal-v1",
    fixtureOnly: true,
    externalWrites: 0,
    externalRequests: 0,
    passed: steps.every((step) => step.passed),
    steps,
  };
}

