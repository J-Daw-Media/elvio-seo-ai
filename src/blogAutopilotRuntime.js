import { evaluateAutopilotEligibility } from "./blogEligibility.js";
import { selectApprovedAsset } from "./creativeStudioRegistry.js";

export const runtimeModes = Object.freeze(["disabled", "readiness", "monitored_trial", "full"]);

export function prepareAutopilotCandidate({ candidate, assets = [], mode = "disabled", killSwitch = true, now = new Date() } = {}) {
  if (!runtimeModes.includes(mode)) throw new Error("BLOG_AUTOPILOT_MODE_INVALID");
  const image = selectApprovedAsset(assets, { topicTags: candidate?.topicTags || [] });
  const enriched = { ...candidate, image: image.available ? { eligible: true, ...image.asset } : { eligible: false } };
  const decision = evaluateAutopilotEligibility(enriched, { now, killSwitch });
  return { mode, candidate: enriched, decision, executable: ["monitored_trial", "full"].includes(mode) && decision.eligible, holdReason: image.available ? null : image.reason };
}

export function productionActivationState(env = process.env) {
  const mode = runtimeModes.includes(env.BLOG_AUTOPILOT_MODE) ? env.BLOG_AUTOPILOT_MODE : "disabled";
  const killSwitch = String(env.BLOG_AUTOPILOT_KILL_SWITCH ?? "true").toLowerCase() !== "false";
  return { mode, killSwitch, wixCredentialAvailable: Boolean(env.WIX_BLOG_AUTOPILOT_CREDENTIAL), publicationEnabled: ["monitored_trial", "full"].includes(mode) && !killSwitch && Boolean(env.WIX_BLOG_AUTOPILOT_CREDENTIAL) };
}
