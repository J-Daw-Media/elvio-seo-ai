import { assertRunnable, safetyState } from "./safety.js";
import { deduplicateOpportunities } from "./scoring.js";

export async function runSeoIntelligence({ collectors = [], opportunities = [], state = safetyState(), now = () => new Date().toISOString() } = {}) {
  assertRunnable(state);
  const sources = [];
  for (const collector of collectors) {
    try { sources.push(await collector()); }
    catch (error) { sources.push({ status: "unavailable", source: "unknown", reason: String(error.message || error), evidence: [] }); }
  }
  const evidence = sources.flatMap((source) => source.evidence || []);
  return {
    mode: state.dryRun ? "dry_run" : "read_only",
    generatedAt: now(),
    writesPerformed: 0,
    externalMutationsPerformed: 0,
    evidence,
    sources: sources.map(({ evidence: _evidence, ...source }) => source),
    opportunities: deduplicateOpportunities(opportunities),
  };
}
