import { sha256 } from "./identity.js";

export const articleSchemaVersion = "elvio-seo-article-v1";

export async function generateArticle({ opportunity, client, model, maxAttempts = 2 } = {}) {
  if (!opportunity?.id || !opportunity?.evidence || !client || !model) throw new Error("ARTICLE_GENERATION_INPUT_REQUIRED");
  let last;
  for (let attempt = 1; attempt <= Math.min(2, maxAttempts); attempt += 1) {
    const response = await client({ model, opportunity, schemaVersion: articleSchemaVersion, attempt, maxOutputTokens: 5000 });
    last = response;
    const article = response?.article;
    const errors = validateGeneratedArticle(article, opportunity);
    if (!errors.length) return { article, fingerprint: sha256(article), attempts: attempt, usage: response.usage || null, validation: { passed: true, errors: [] } };
  }
  return { article: last?.article || null, attempts: Math.min(2, maxAttempts), usage: last?.usage || null, validation: { passed: false, errors: validateGeneratedArticle(last?.article, opportunity) }, held: true };
}

export function validateGeneratedArticle(article, opportunity = {}) {
  const errors = [];
  if (!article?.title || !article?.seoTitle || !article?.seoDescription || !article?.excerpt) errors.push("metadata_incomplete");
  if (!Array.isArray(article?.sections) || article.sections.length < 3) errors.push("body_incomplete");
  if (article?.h1 !== article?.title) errors.push("authoritative_h1_mismatch");
  if (article?.ctaUrl !== "https://www.djelvio.nl/contact") errors.push("cta_invalid");
  if (!Array.isArray(article?.evidenceRefs) || !article.evidenceRefs.includes(opportunity.evidence?.id)) errors.push("evidence_untraceable");
  if (article?.unsupportedClaims?.length) errors.push("unsupported_claims");
  return errors;
}
