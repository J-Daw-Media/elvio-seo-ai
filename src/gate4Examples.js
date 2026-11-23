import { buildSeoBrief, evaluateOpportunity } from "./contentIntelligence.js";
import { buildArticleReview, buildExistingPageReview, buildGate4DryRun } from "./gate4Content.js";

export function gate4DryRunExample() {
  const pricingOpportunity = evaluateOpportunity({
    topic: "DJ prijzen en pakketten", eventCategory: "pricing", existingPage: "/wat-kost-een-dj-per-uur",
    commercialRelevance: 90, searchIntent: 96, evidenceStrength: 86, existingVisibility: 65,
    serviceFit: 94, conversionRelevance: 90, coverageGap: 45, competitionFeasibility: 60,
    implementationEase: 80, duplicationSafety: 90, cannibalizationRisk: "low_existing_page",
  });
  const pageReview = buildExistingPageReview({
    opportunity: pricingOpportunity,
    currentPage: {
      url: "https://www.djelvio.nl/wat-kost-een-dj-per-uur",
      content: {
        title: "Wat kost een DJ per uur?",
        keySections: ["Waarom het geen standaardprijs is", "Wat krijg je?", "Wat jij wél alvast kunt verwachten"],
        verifiedIssue: "De openbare pagina noemt 25 jaar ervaring; de goedgekeurde formulering is meer dan 20 jaar ervaring als DJ.",
      },
    },
    proposed: {
      searchIntent: "commercial_pricing_information",
      commercialObjective: "Bezoekers helpen de prijsopbouw te begrijpen en gekwalificeerde offerteaanvragen stimuleren.",
      content: {
        title: "Wat kost een DJ voor jouw feest?",
        introduction: "De prijs van een DJ hangt af van het type evenement, het aantal gasten, de speelduur, de locatie en de gewenste techniek. Daarom ontvangt iedere aanvraag een offerte die past bij het feest.",
        sections: [
          { heading: "Welke keuzes bepalen de prijs?", body: "Beschrijf afzonderlijk de speelduur, het aantal gasten, de locatie en de keuze tussen DJ-only en een complete drive-in met geluid en licht." },
          { heading: "DJ-only of complete drive-in", body: "Leg het verschil uit zonder nieuwe pakketten, prijzen of beschikbaarheidsclaims te introduceren." },
          { heading: "Wat hebben we nodig voor een offerte?", body: "Vraag om datum, locatie, type evenement, aantal gasten en gewenste speelduur." },
        ],
        experienceCorrection: "Gebruik uitsluitend: meer dan 20 jaar ervaring als DJ.",
      },
      metadata: { title: "Wat kost een DJ voor jouw feest? | DJ Elvio", description: "Ontdek welke keuzes de prijs van een DJ bepalen en vraag een vrijblijvende offerte aan voor een passende DJ-service." },
      internalLinks: ["/bruiloftsfeest", "/bedrijfsfeest", "/contact"],
      cta: "Vraag vrijblijvend een offerte aan.",
      explanation: "De huidige pagina sluit aan op commerciële prijsintentie, maar kan duidelijker uitleggen welke factoren de offerte bepalen en gebruikt een niet-goedgekeurde ervaringsclaim.",
      factualVerificationRequirements: ["Definitieve prijzen blijven buiten dit voorstel", "Geen nieuwe pakketvoorwaarden", "Controle van de bestaande Wix-paginavolgorde"],
    },
    evidence: ["public-page-snapshot:2026-11-23", "verified-pricing-source:vendor/pricing.js", "business-fact:more-than-20-years"],
  });

  const articleOpportunity = evaluateOpportunity({
    topic: "Muziekplanning voor een internationale bruiloft", eventCategory: "wedding", commercialRelevance: 78,
    searchIntent: 72, evidenceStrength: 70, existingVisibility: 25, serviceFit: 92, conversionRelevance: 76,
    coverageGap: 82, competitionFeasibility: 58, implementationEase: 62, duplicationSafety: 76,
    cannibalizationRisk: "manual_review_required",
  });
  const brief = buildSeoBrief(articleOpportunity, {
    audience: "Bruidsparen met internationale gasten en verschillende generaties",
    sourceEvidence: ["public-service-page:/bruiloftsfeest", "verified-business-fact:musical-versatility", "verified-business-fact:more-than-20-years"],
    proposedTitle: "Muziek voor een internationale bruiloft: zo verbind je alle gasten",
    proposedMetaDescription: "Praktische tips voor muziek op een internationale bruiloft, met aandacht voor verschillende culturen, generaties en momenten van de dag.",
    headingOutline: ["H1: Muziek voor een internationale bruiloft", "H2: Begin met jullie eigen verhaal", "H2: Geef verschillende generaties een plek", "H2: Plan vaste momenten, maar houd ruimte", "H2: DJ-only of complete drive-in", "H2: Bespreek wensen vooraf"],
    questionsToAnswer: ["Hoe combineer je verschillende muziekstijlen?", "Welke informatie heeft de DJ vooraf nodig?", "Wanneer past DJ-only of een complete drive-in?"],
    internalLinks: ["/bruiloftsfeest", "/contact"],
  });
  const articleH1 = "Muziek voor een internationale bruiloft: zo verbind je alle gasten";
  const articleH2s = ["Begin met jullie gezamenlijke muzikale verhaal", "Maak ruimte voor talen, culturen en generaties", "Leg traditionele momenten vooraf vast", "Werk met must-play en do-not-play keuzes", "Stem de techniek en planning af met de locatie", "Lees de dansvloer en blijf flexibel", "DJ-only of een complete drive-in"];
  const fullBodyHtml = [
    `<h1>${articleH1}</h1>`,
    "<p>Op een internationale bruiloft komen vaak families, talen, leeftijden en muzikale voorkeuren samen. Een bruikbaar muziekplan probeert die verschillen niet weg te poetsen. Het geeft verschillende groepen herkenbare momenten en bouwt tegelijk naar een dansvloer waarop gasten samen kunnen vieren.</p>",
    "<h2>Begin met jullie gezamenlijke muzikale verhaal</h2>",
    "<p>Bespreek eerst welke muziek bij jullie als bruidspaar hoort. Denk aan nummers uit jullie jeugd, muziek die thuis werd gedraaid en liedjes die verbonden zijn aan familie, vrienden of belangrijke plaatsen. Benoem ook in welke talen bepaalde nummers belangrijk zijn. Zo ontstaat een persoonlijke basis zonder dat de avond een reeks losse verzoeknummers wordt.</p>",
    "<h2>Maak ruimte voor talen, culturen en generaties</h2>",
    "<p>Gasten hoeven niet ieder nummer te kennen om samen te kunnen dansen. Herkenbare ritmes, refreinen en zorgvuldig gekozen overgangen kunnen verschillende groepen bij elkaar brengen. Oudere familieleden reageren mogelijk op andere periodes dan vrienden die recente hits verwachten. De voorbereiding moet daarom duidelijk maken welke stijlen en talen vertegenwoordigd zijn, zonder te veronderstellen dat één keuze voor een hele cultuur spreekt.</p>",
    "<h2>Leg traditionele momenten vooraf vast</h2>",
    "<p>Een entree, openingsdans, familiedans of ander traditioneel moment kan een specifieke opname, versie of starttijd vereisen. Leg per moment vast welk nummer nodig is, wie het teken geeft en of de locatie microfoons of andere techniek verzorgt. Laat het bruidspaar de definitieve keuze bevestigen; de DJ hoeft geen betekenis of traditie in te vullen die niet expliciet is besproken.</p>",
    "<h2>Werk met must-play en do-not-play keuzes</h2>",
    "<p>Een korte must-playlijst geeft richting aan belangrijke momenten en nummers die echt bij jullie horen. Een do-not-playlijst voorkomt muziek die niet past of een ongewenste associatie heeft. Houd beide lijsten overzichtelijk. Voor het vrije feestgedeelte blijft dan voldoende ruimte om verzoeken te beoordelen en te reageren op wat op de dansvloer werkt.</p>",
    "<h2>Stem de techniek en planning af met de locatie</h2>",
    "<p>Controleer vooraf de beschikbare geluidsinstallatie, aansluitmogelijkheden, opbouwtijd, geluidslimieten en de positie van de DJ. Spreek met de locatie of ceremoniemeester af wie wijzigingen in het programma doorgeeft. Dat voorkomt onduidelijkheid wanneer een speech uitloopt, een traditioneel moment verschuift of meerdere talen in aankondigingen worden gebruikt.</p>",
    "<h2>Lees de dansvloer en blijf flexibel</h2>",
    "<p>Een planning geeft houvast, maar de reactie van de gasten bepaalt de volgorde tijdens het feest. Soms werkt een langer blok binnen één stijl; op een ander moment is een snellere overgang nodig om meerdere groepen mee te nemen. De DJ gebruikt de afgesproken voorkeuren als kader en past de route binnen dat kader aan de dansvloer aan.</p>",
    "<h2>DJ-only of een complete drive-in</h2>",
    "<p>Heeft de locatie passende techniek, dan kan een DJ-only invulling worden besproken. Is er nog geluid en licht nodig, dan kan een complete drive-in passend zijn. De benodigde opstelling hangt af van de ruimte, het aantal gasten, het programma en de afspraken met de locatie. De definitieve invulling en beschikbaarheid worden altijd per aanvraag bevestigd.</p>",
    "<p>Met meer dan 20 jaar ervaring als DJ bereidt DJ Elvio de muziek samen met het bruidspaar voor. Willen jullie bespreken welke muzikale en technische aanpak bij jullie bruiloft past? Vraag dan vrijblijvend een offerte aan via <a href=\"https://www.djelvio.nl/contact\">de contactpagina van DJ Elvio</a>.</p>",
  ].join("\n");
  const articleReview = buildArticleReview({
    opportunity: articleOpportunity, brief,
    facts: { fullBodyHtml, h1: articleH1, h2s: articleH2s },
    existingContent: [
      { id: "page-wedding", url: "/bruiloftsfeest", title: "Bruiloft DJ huren", description: "Commerciële servicepagina voor DJ-only en complete drive-in." },
      { id: "article-day-programme", url: "/post/dagprogramma-bruiloft", title: "Dagprogramma bruiloft", description: "Informatie over de planning van de trouwdag." },
    ],
    imagery: [],
    seoEvidenceStatus: "pending_first_party_search_evidence",
    cannibalizationAssessment: { status: "editorially_distinct_seo_evidence_pending", relatedPages: [{ url: "/bruiloftsfeest", overlap: "commercial wedding service" }, { url: "/post/dagprogramma-bruiloft", overlap: "wedding planning information" }], distinctAngle: "multilingual and multi-generational music planning", conclusion: "The article is editorially useful and distinct in angle, but current evidence does not prove enough separate query demand to authorize publication." },
  });
  return buildGate4DryRun({ pageReview, articleReview });
}
