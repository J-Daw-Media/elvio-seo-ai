import { generateArticle } from "./autopilotGeneration.js";

export const vertexGenerationDefaults = Object.freeze({
  location: "global", model: "gemini-3.8-flash", maxAttempts: 2, maxOutputTokens: 5000,
  temperature: 0.35, requestTimeoutMs: 180_000,
  inputUsdPerMillionTokens: 0.75, outputUsdPerMillionTokens: 3.75,
});

const responseSchema = {
  type: "OBJECT", required: ["title", "seoTitle", "seoDescription", "excerpt", "h1", "sections", "ctaUrl", "evidenceRefs", "unsupportedClaims"],
  properties: {
    title: { type: "STRING" }, seoTitle: { type: "STRING" }, seoDescription: { type: "STRING" }, excerpt: { type: "STRING" }, h1: { type: "STRING" },
    sections: { type: "ARRAY", minItems: 4, items: { type: "OBJECT", required: ["heading", "paragraphs"], properties: { heading: { type: "STRING" }, paragraphs: { type: "ARRAY", minItems: 1, items: { type: "STRING" } } } } },
    ctaText: { type: "STRING" }, ctaUrl: { type: "STRING" }, internalLinks: { type: "ARRAY", items: { type: "STRING" } },
    evidenceRefs: { type: "ARRAY", items: { type: "STRING" } }, unsupportedClaims: { type: "ARRAY", items: { type: "STRING" } },
  },
};

function promptFor(opportunity, facts) {
  return `Schrijf een praktisch, professioneel Nederlands artikel voor Allround DJ Elvio.\n\nOnderwerp: ${opportunity.topic}\nZoekintentie: ${opportunity.searchIntent}\nCommercieel doel: ${opportunity.commercialObjective}\nTraceerbare evidence-ID: ${opportunity.evidence.id}\nGerelateerde echte zoekvragen: ${(opportunity.relatedQueries || []).map((item) => item.query).join("; ") || "geen"}\n\nGoedgekeurde feiten:\n${facts.map((item) => `- ${item}`).join("\n")}\n\nRegels:\n- Schrijf natuurlijk en nuttig, zonder keyword stuffing.\n- Gebruik geen prijzen, beschikbaarheid, testimonials, garanties, partnerships of aantallen boekingen.\n- Presenteer stockfotografie nooit als een echt DJ Elvio-evenement.\n- Onderscheid DJ-only van een complete drive-in alleen als mogelijkheid per aanvraag.\n- Gebruik precies de evidence-ID in evidenceRefs.\n- CTA moet verwijzen naar https://www.djelvio.nl/contact.\n- Maak vier tot zes H2-secties; de Wix-paginatitel wordt de enige H1.`;
}

export function createVertexGenerationClient({ projectId, accessTokenProvider, fetchImpl = fetch, defaults = vertexGenerationDefaults } = {}) {
  if (!projectId || typeof accessTokenProvider !== "function") throw new Error("VERTEX_GENERATION_AUTH_REQUIRED");
  return async ({ model = defaults.model, opportunity, maxOutputTokens = defaults.maxOutputTokens }) => {
    const token = await accessTokenProvider();
    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${defaults.location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetchImpl(endpoint, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(defaults.requestTimeoutMs),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: promptFor(opportunity, opportunity.approvedBusinessFacts || []) }] }], generationConfig: { responseMimeType: "application/json", responseSchema, temperature: defaults.temperature, maxOutputTokens } }),
    });
    if (!response.ok) throw new Error(`VERTEX_GENERATION_HTTP_${response.status}`);
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    if (!text) throw new Error("VERTEX_GENERATION_EMPTY");
    const usage = payload.usageMetadata || {};
    const article = JSON.parse(text);
    if (article.title) article.h1 = article.title;
    return { article, usage: { inputTokens: Number(usage.promptTokenCount || 0), outputTokens: Number(usage.candidatesTokenCount || 0), estimatedUsd: estimateGenerationCost(usage, defaults) } };
  };
}

export function estimateGenerationCost(usage = {}, defaults = vertexGenerationDefaults) {
  return Number((((Number(usage.promptTokenCount || 0) * defaults.inputUsdPerMillionTokens) + (Number(usage.candidatesTokenCount || 0) * defaults.outputUsdPerMillionTokens)) / 1_000_000).toFixed(6));
}

export async function generateProductionArticle({ opportunity, approvedBusinessFacts, accessTokenProvider, projectId, fetchImpl, model = vertexGenerationDefaults.model } = {}) {
  const evidence = { id: opportunity.evidenceFactors?.[0]?.ref || opportunity.id };
  const input = { ...opportunity, evidence, approvedBusinessFacts };
  return generateArticle({ opportunity: input, client: createVertexGenerationClient({ projectId, accessTokenProvider, fetchImpl }), model, maxAttempts: 2 });
}

