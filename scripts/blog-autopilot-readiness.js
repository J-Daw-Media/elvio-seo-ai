import { productionActivationState } from "../src/blogAutopilotRuntime.js";
import { validateAssetRegistry } from "../src/creativeStudioRegistry.js";
import { loadBundledCreativeStudioRegistry } from "../src/creativeStudioProduction.js";

const state = productionActivationState();
const assets = validateAssetRegistry(loadBundledCreativeStudioRegistry());
const report = {
  schemaVersion: "elvio-blog-autopilot-readiness-v1",
  checkedAt: new Date().toISOString(),
  state,
  creativeStudio: assets,
  readyForPublicTrial: state.mode === "monitored_trial" && state.publicationEnabled && assets.usable > 0,
  blockers: [
    ...(assets.usable ? [] : ["approved_creative_studio_asset_required"]),
    ...(state.wixCredentialAvailable ? [] : ["temporary_wix_credential_required_at_execution"]),
    ...(state.killSwitch ? ["kill_switch_active"] : []),
    ...(state.mode === "monitored_trial" ? [] : ["monitored_trial_mode_not_authorized"]),
  ],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.readyForPublicTrial) process.exitCode = 0;
