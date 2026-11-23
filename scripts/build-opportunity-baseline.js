import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deduplicateOpportunities } from "../src/scoring.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "output", "opportunities-2026-11-23.json");

const opportunities = deduplicateOpportunities([
  {
    topic: "DJ huren Amsterdam",
    eventCategory: "local-commercial",
    landingPage: "/dj-huren-nederland",
    firstPartyDemand: 74,
    commercialIntent: 95,
    siteCoverageGap: 86,
    rankingFeasibility: 62,
    evidenceConfidence: 78,
    geographicRelevance: 100,
    seasonality: 55,
    potentialBookingValue: 82,
  },
  {
    topic: "DJ prijs per uur en wat is inbegrepen",
    eventCategory: "price-intent",
    landingPage: "/wat-kost-een-dj-per-uur",
    firstPartyDemand: 88,
    commercialIntent: 96,
    siteCoverageGap: 55,
    rankingFeasibility: 70,
    evidenceConfidence: 85,
    geographicRelevance: 68,
    seasonality: 45,
    potentialBookingValue: 80,
  },
  {
    topic: "All-in trouwfeest DJ pakket",
    eventCategory: "wedding",
    landingPage: "/bruiloftsfeest",
    firstPartyDemand: 54,
    commercialIntent: 94,
    siteCoverageGap: 66,
    rankingFeasibility: 66,
    evidenceConfidence: 72,
    geographicRelevance: 70,
    seasonality: 72,
    potentialBookingValue: 88,
  },
  {
    topic: "DJ personeelsfeest en bedrijfsfeest",
    eventCategory: "corporate",
    landingPage: "/bedrijfsfeest",
    firstPartyDemand: 50,
    commercialIntent: 91,
    siteCoverageGap: 64,
    rankingFeasibility: 68,
    evidenceConfidence: 70,
    geographicRelevance: 68,
    seasonality: 80,
    potentialBookingValue: 90,
  },
  {
    topic: "Dagprogramma bruiloft",
    eventCategory: "wedding-information",
    landingPage: "/post/dagprogramma-bruiloft",
    firstPartyDemand: 82,
    commercialIntent: 52,
    siteCoverageGap: 38,
    rankingFeasibility: 76,
    evidenceConfidence: 84,
    geographicRelevance: 62,
    seasonality: 65,
    potentialBookingValue: 64,
  },
  {
    topic: "DJ voor sportevenement",
    eventCategory: "sports",
    landingPage: "/sportevenement",
    firstPartyDemand: 76,
    commercialIntent: 82,
    siteCoverageGap: 48,
    rankingFeasibility: 65,
    evidenceConfidence: 78,
    geographicRelevance: 65,
    seasonality: 46,
    potentialBookingValue: 68,
  },
  {
    topic: "DJ voor klein verjaardagsfeest of privefeest",
    eventCategory: "birthday-private",
    landingPage: null,
    firstPartyDemand: 20,
    commercialIntent: 82,
    siteCoverageGap: 78,
    rankingFeasibility: 55,
    evidenceConfidence: 35,
    geographicRelevance: 65,
    seasonality: 50,
    potentialBookingValue: 52,
  },
]);

const artifact = {
  generatedAt: "2026-11-23T00:00:00+01:00",
  mode: "read_only_baseline",
  sourceWindow: "Search Console UI, 2026-11-04 through 2026-11-21",
  caveat: "Scores rank research and optimization opportunities. They do not predict bookings or authorize publication.",
  opportunities,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(outputPath);
