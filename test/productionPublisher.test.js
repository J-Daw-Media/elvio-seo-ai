import test from "node:test";
import assert from "node:assert/strict";
import { discoverOpportunities } from "../src/opportunityDiscoveryV2.js";
import { runPublisherPipeline } from "../src/publisherOrchestrator.js";
import { loadBundledCreativeStudioRegistry } from "../src/creativeStudioProduction.js";
import { createVertexGenerationClient, estimateGenerationCost } from "../src/vertexArticleGenerator.js";
import { InMemoryAutopilotExecutionLedger } from "../src/autopilotExecutionLedger.js";

const now = new Date("2026-11-28T09:05:00.000Z");
const evidence = [{ id: "gsc-1", source: "google_search_console", keyword: "bedrijfsfeest muziek", landingPage: "https://www.djelvio.nl/bedrijfsfeest", metrics: { impressions: 8, clicks: 0 } }];
const article = (evidenceRef) => ({
  title: "Welke muziek past bij een bedrijfsfeest?", seoTitle: "Muziek voor een bedrijfsfeest | DJ Elvio", seoDescription: "Praktische tips voor muziek en voorbereiding bij een bedrijfsfeest.", excerpt: "Muziek en voorbereiding voor een bedrijfsfeest.", h1: "Welke muziek past bij een bedrijfsfeest?",
  sections: [
    { heading: "Begin met het doel van de avond", paragraphs: ["Bepaal vooraf welke sfeer bij het programma en de gasten past."] },
    { heading: "Houd rekening met verschillende gasten", paragraphs: ["Een gevarieerde muziekkeuze helpt om verschillende leeftijden te betrekken."] },
    { heading: "Stem muziek af op het programma", paragraphs: ["Plan rustige momenten en dansmomenten in overleg met de organisatie."] },
    { heading: "Bespreek techniek en locatie", paragraphs: ["Controleer vooraf de beschikbare ruimte, stroom en praktische afspraken."] },
  ],
  ctaText: "Vraag vrijblijvend een offerte aan", ctaUrl: "https://www.djelvio.nl/contact", internalLinks: ["https://www.djelvio.nl/bedrijfsfeest"], evidenceRefs: [evidenceRef], unsupportedClaims: [],
});

test("discovery creates a real backlog and separates supported, overlap and research-pending states", () => {
  const results = discoverOpportunities({ evidence, existingContent: [{ id: "old", title: "Muziek voor een personeelsfeest", slug: "muziek-personeelsfeest" }], sourceFingerprint: "source-1", evaluatedAt: now.toISOString() });
  assert.equal(results.length, 10);
  assert.ok(results.some((item) => item.state === "eligible_for_generation"));
  assert.ok(results.some((item) => item.state === "existing_page_optimization_recommended"));
  assert.ok(results.some((item) => item.state === "research_pending"));
});

test("production entrypoint treats no eligible candidate as a successful zero-publication execution", async () => {
  const executions = [];
  const result = await runPublisherPipeline({ evidence: [], existingContent: [], assets: loadBundledCreativeStudioRegistry(), sourceFingerprint: "empty-source", mode: "readiness", killSwitch: true, now, generate: async () => { throw new Error("must not generate"); }, persistExecution: async (value) => executions.push(value) });
  assert.equal(result.status, "completed_no_publication");
  assert.equal(result.reason, "no_eligible_candidate");
  assert.equal(result.writesToWix, 0);
  assert.equal(executions.length, 1);
});

test("readiness uses the real generation path and persists an eligible non-publishing candidate", async () => {
  const events = []; let calls = 0;
  const result = await runPublisherPipeline({
    evidence, existingContent: [], assets: loadBundledCreativeStudioRegistry(), sourceFingerprint: "real-source", mode: "readiness", killSwitch: true, now,
    generate: async (candidate) => { calls += 1; const ref = candidate.evidenceFactors[0].ref; return { article: article(ref), fingerprint: "f", attempts: 1, usage: { inputTokens: 100, outputTokens: 500, estimatedUsd: 0.00128 }, validation: { passed: true, errors: [] } }; },
    persistEvent: async (event) => events.push(event),
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "completed_no_publication");
  assert.equal(result.reason, "readiness_mode");
  assert.equal(result.writesToWix, 0);
  assert.ok(events.some((event) => event.state === "eligible_for_publication"));
});

test("kill switch prevents transport even after successful generation", async () => {
  let publishCalls = 0;
  const result = await runPublisherPipeline({ evidence, existingContent: [], assets: loadBundledCreativeStudioRegistry(), sourceFingerprint: "kill-source", mode: "full", killSwitch: true, now, generate: async (candidate) => ({ article: article(candidate.evidenceFactors[0].ref), validation: { passed: true, errors: [] } }), publish: async () => { publishCalls += 1; } });
  assert.equal(publishCalls, 0); assert.equal(result.reason, "kill_switch_active");
});

test("failed generation is held without image or Wix activity", async () => {
  let publishCalls = 0;
  const result = await runPublisherPipeline({ evidence, existingContent: [], assets: loadBundledCreativeStudioRegistry(), sourceFingerprint: "failed-generation", mode: "full", killSwitch: false, now, generate: async () => ({ article: null, validation: { passed: false, errors: ["body_incomplete"] } }), publish: async () => { publishCalls += 1; } });
  assert.equal(result.reason, "generation_or_validation_failed"); assert.equal(publishCalls, 0);
});

test("missing approved imagery holds an otherwise valid candidate", async () => {
  const result = await runPublisherPipeline({ evidence, existingContent: [], assets: [], sourceFingerprint: "no-image", mode: "full", killSwitch: false, now, generate: async (candidate) => ({ article: article(candidate.evidenceFactors[0].ref), validation: { passed: true, errors: [] } }), publish: async () => { throw new Error("must not publish"); } });
  assert.equal(result.reason, "candidate_held"); assert.equal(result.writesToWix, 0);
});

test("Vertex adapter requests bounded structured output and records token cost", async () => {
  let request;
  const client = createVertexGenerationClient({ projectId: "p", accessTokenProvider: async () => "token", fetchImpl: async (_url, options) => { request = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(article("e1")) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 2000 } }) }; } });
  const response = await client({ opportunity: { topic: "t", searchIntent: "i", commercialObjective: "c", evidence: { id: "e1" }, approvedBusinessFacts: [] }, model: "gemini-2.5-flash", maxOutputTokens: 5000 });
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.equal(request.generationConfig.maxOutputTokens, 5000);
  assert.ok(response.usage.estimatedUsd > 0);
  assert.equal(estimateGenerationCost({ promptTokenCount: 1000, candidatesTokenCount: 2000 }), response.usage.estimatedUsd);
});

test("atomic ledger blocks duplicate slots, monthly exhaustion and exploratory exhaustion", async () => {
  const ledger = new InMemoryAutopilotExecutionLedger();
  for (let index = 0; index < 2; index += 1) assert.equal((await ledger.reserve({ monthKey: "2026-11", slotKey: `2026-11:day-0${index + 3}`, articleId: `a${index}`, contentFingerprint: `f${index}`, exploratory: true })).created, true);
  const exploratory = await ledger.reserve({ monthKey: "2026-11", slotKey: "2026-11:day-13", articleId: "a3", contentFingerprint: "f3", exploratory: true });
  assert.equal(exploratory.created, false);
  const duplicate = await ledger.reserve({ monthKey: "2026-11", slotKey: "2026-11:day-03", articleId: "different", contentFingerprint: "different", exploratory: false });
  assert.equal(duplicate.created, false);
  for (let index = 0; index < 4; index += 1) await ledger.reserve({ monthKey: "2026-11", slotKey: `2026-11:extra-${index}`, articleId: `n${index}`, contentFingerprint: `nf${index}`, exploratory: false });
  assert.equal((await ledger.reserve({ monthKey: "2026-11", slotKey: "2026-11:seventh", articleId: "seventh", contentFingerprint: "seventh", exploratory: false })).created, false);
});

