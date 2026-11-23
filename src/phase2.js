import { initialPhase2Opportunities, buildSeoBrief } from "./contentIntelligence.js";
import { prepareDutchDraft } from "./contentProduction.js";
import { createReviewPackage } from "./review.js";
import { buildWixDraftPayload } from "./wixDrafts.js";

export function runPhase2Preparation({ opportunities = initialPhase2Opportunities(), evidence = {} } = {}) {
  const briefs = opportunities.map((opportunity) => buildSeoBrief(opportunity, evidence[opportunity.id] || {}));
  const eligibleBriefs = briefs.filter((brief) => brief.recommendation !== "no_action_needed" && brief.confidence !== "limited");
  const drafts = eligibleBriefs.map((brief) => prepareDutchDraft(brief));
  const reviews = drafts.map((draft) => createReviewPackage({ draft, brief: eligibleBriefs.find((brief) => brief.id === draft.briefId) }));
  const wixPayloads = drafts.filter((draft) => draft.destination === "wix_blog_draft_candidate").map((draft) => buildWixDraftPayload(draft));
  return {
    mode: "development_dry_run", opportunities, briefs, drafts, reviews, wixPayloads,
    writesPerformed: 0, externalMutationsPerformed: 0, productionActivationEnabled: false,
  };
}
