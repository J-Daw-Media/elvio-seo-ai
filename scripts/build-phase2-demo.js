import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initialPhase2Opportunities, buildSeoBrief } from "../src/contentIntelligence.js";
import { prepareDutchDraft } from "../src/contentProduction.js";
import { createReviewPackage } from "../src/review.js";
import { buildWixDraftPayload } from "../src/wixDrafts.js";

const opportunities = initialPhase2Opportunities();
const selected = opportunities.find((item) => item.eventCategory === "local");
const brief = buildSeoBrief(selected, {
  supportingQueries: ["dj huren amsterdam"],
  audience: "Organisatoren in Amsterdam en opdrachtgevers die een DJ in Nederland zoeken",
  sourceEvidence: ["Search Console baseline: dj huren amsterdam had 28 impressions and 0 clicks", "Existing page: /dj-huren-nederland", "Live metadata update verified 23 November 2026"],
  proposedTitle: "DJ huren in Amsterdam: voorbereiding en mogelijkheden",
  proposedMetaDescription: "Lees waar je op let bij het huren van een DJ in Amsterdam, van muziek en voorbereiding tot DJ-only en complete drive-in mogelijkheden.",
  headingOutline: ["H1: DJ huren in Amsterdam", "H2: Welke DJ-service past bij jouw evenement?", "H2: Muziek, techniek en voorbereiding", "H2: DJ-only of complete drive-in", "H2: Vrijblijvend een offerte aanvragen"],
  internalLinks: ["/dj-huren-nederland", "/wat-kost-een-dj-per-uur", "/contact"],
});
const draft = prepareDutchDraft(brief);
const review = createReviewPackage({ draft, brief, evidence: brief.sourceEvidence });
const wixDryRun = buildWixDraftPayload(draft);
const artifact = { generatedAt: new Date().toISOString(), mode: "phase2_development_only", opportunities, demonstration: { brief, draft, review: { ...review, draft: undefined }, wixDryRun }, productionWrites: 0 };
const output = resolve("output", "phase2-demonstration-2026-11-23.json");
await mkdir(resolve("output"), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, opportunityCount: opportunities.length, selected: selected.topic, draftValid: draft.validation.valid, wixMode: wixDryRun.mode }, null, 2));
