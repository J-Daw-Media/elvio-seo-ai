import { stableId, sha256 } from "./identity.js";
import { verifiedPricingContext } from "./pricingContext.js";

const UNSUPPORTED = /nummer\s*1|beste\s+dj\s+van|altijd beschikbaar|gegarandeerd resultaat|duizenden tevreden/i;
const UNSAFE_HTML = /<\s*(script|iframe|object|embed|form)\b|on\w+\s*=/i;

export function validateContentDraft(draft = {}) {
  const errors = [];
  if (!draft.title || !draft.slug || !draft.metaDescription || !draft.h1 || !draft.bodyHtml || !draft.cta) errors.push("required_field_missing");
  if (UNSAFE_HTML.test(draft.bodyHtml || "")) errors.push("unsafe_html");
  if (UNSUPPORTED.test(JSON.stringify(draft))) errors.push("unsupported_claim");
  if (/€\s*\d/.test(JSON.stringify(draft)) && !draft.authoritativePricingEvidence) errors.push("unverified_price_claim");
  if (!/offerte/i.test(draft.cta || "")) errors.push("quotation_cta_missing");
  if (!Array.isArray(draft.sourceEvidence) || draft.sourceEvidence.length === 0) errors.push("source_evidence_missing");
  if (draft.approvalStatus !== "pending_review") errors.push("approval_gate_missing");
  return { valid: errors.length === 0, errors };
}

export function safeSlug(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function prepareDutchDraft(brief, facts = {}) {
  const pricing = verifiedPricingContext();
  const title = brief.proposedTitle || brief.primaryTopic;
  const slug = safeSlug(title);
  const naturalSubject = /dj huren amsterdam/i.test(brief.primaryTopic)
    ? "een DJ in Amsterdam wil huren"
    : `informatie zoekt over ${brief.primaryTopic.toLowerCase()}`;
  const paragraphs = [
    `Wie ${naturalSubject}, wil vooraf weten welke aanpak past bij het evenement, de locatie en de gasten. Allround DJ Elvio bespreekt daarom eerst de gewenste sfeer, het programma en de praktische mogelijkheden.`,
    `Afhankelijk van de aanvraag is een DJ-only invulling of een complete drive-in met professioneel geluid en licht mogelijk. De uiteindelijke uitvoering wordt afgestemd op de speelduur, de locatie en het aantal gasten.`,
    `Met meer dan 20 jaar ervaring als DJ richt DJ Elvio zich op een professionele voorbereiding en een muziekkeuze die aansluit bij verschillende leeftijden en voorkeuren. Beschikbaarheid en de exacte invulling worden altijd per aanvraag bevestigd.`,
    facts.additionalVerifiedParagraph || `Voor een passende offerte zijn in ieder geval de datum, locatie, het type evenement, het aantal gasten en de gewenste speelduur nodig.`,
  ];
  const draft = {
    id: stableId("seo-content-draft", { briefId: brief.id, version: 1 }), briefId: brief.id, language: "nl-NL",
    destination: brief.targetPage ? "existing_page_proposal" : "wix_blog_draft_candidate",
    title, slug, metaDescription: brief.proposedMetaDescription || `Praktische informatie over ${brief.primaryTopic.toLowerCase()}, de voorbereiding en de mogelijkheden bij Allround DJ Elvio.`,
    h1: brief.primaryTopic, h2s: ["Welke invulling past bij het evenement?", "Voorbereiding en techniek", "Vrijblijvend een offerte aanvragen"],
    bodyHtml: paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n"),
    faq: brief.questionsToAnswer.map((question) => ({ question, answerStatus: "requires_editorial_answer" })),
    internalLinks: brief.internalLinks, cta: "Vraag vrijblijvend een offerte aan via https://www.djelvio.nl/contact.",
    sourceEvidence: brief.sourceEvidence, factsRequiringConfirmation: brief.factualVerification,
    authoritativePricingEvidence: pricing.source, approvalStatus: "pending_review", publishReady: false,
  };
  const validation = validateContentDraft(draft);
  return { ...draft, fingerprint: sha256(draft), validation };
}

export function detectDuplicateContent(candidate, existing = []) {
  const normalized = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, " ").trim();
  const title = normalized(candidate.title); const slug = safeSlug(candidate.slug);
  return existing.filter((item) => normalized(item.title) === title || safeSlug(item.slug) === slug).map((item) => ({ id: item.id, title: item.title, slug: item.slug, reason: normalized(item.title) === title ? "duplicate_title" : "duplicate_slug" }));
}
