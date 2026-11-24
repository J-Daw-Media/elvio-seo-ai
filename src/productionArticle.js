import { safeSlug, validateContentDraft, contentSimilarity } from "./contentProduction.js";
import { sha256 } from "./identity.js";

const escape = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function prepareProductionDraft(article, opportunity, existingContent = []) {
  const bodyHtml = article.sections.map((section) => `<h2>${escape(section.heading)}</h2>\n${section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("\n")}`).join("\n")
    + `\n<p><a href="https://www.djelvio.nl/contact">${escape(article.ctaText || "Vraag vrijblijvend een offerte aan")}</a></p>`;
  const draft = {
    id: opportunity.stableArticleId, briefId: opportunity.id, language: "nl-NL", destination: "wix_blog_draft_candidate",
    title: article.title, seoTitle: article.seoTitle, slug: safeSlug(article.title), metaDescription: article.seoDescription, h1: article.title,
    h2s: article.sections.map((section) => section.heading), bodyHtml, cta: `${article.ctaText || "Vraag vrijblijvend een offerte aan"} via https://www.djelvio.nl/contact.`,
    internalLinks: [...new Set([...(article.internalLinks || []), "https://www.djelvio.nl/contact"])], sourceEvidence: article.evidenceRefs,
    factsRequiringConfirmation: [], authoritativePricingEvidence: null, approvalStatus: "pending_review", publishReady: false,
    duplicateMatches: [], approvedImagery: [],
  };
  const similarity = contentSimilarity(draft, existingContent);
  draft.duplicateMatches = similarity.filter((item) => item.similarity >= 0.58);
  const validation = validateContentDraft(draft);
  const contentFingerprint = sha256({ ...draft, validation });
  return { ...draft, validation, contentFingerprint, similarity: similarity.slice(0, 5) };
}

