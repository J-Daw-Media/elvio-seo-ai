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
  const fullBodyHtml = [
    "<h1>Muziek voor een internationale bruiloft: zo verbind je alle gasten</h1>",
    "<p>Op een internationale bruiloft komen vaak verschillende families, talen, leeftijden en muzikale gewoonten samen. De muziek hoeft die verschillen niet weg te poetsen. Een goed voorbereide avond geeft juist meerdere groepen een herkenbaar moment en bouwt stap voor stap naar een gezamenlijke dansvloer.</p>",
    "<h2>Begin met jullie eigen verhaal</h2>",
    "<p>Maak eerst duidelijk welke muziek bij jullie als bruidspaar hoort. Denk aan nummers uit jullie jeugd, muziek die thuis werd gedraaid en liedjes die belangrijk zijn voor familie of vrienden. Deze basis helpt de DJ om keuzes te maken die persoonlijk voelen, zonder dat de avond een lange lijst losse verzoeknummers wordt.</p>",
    "<h2>Geef verschillende generaties een plek</h2>",
    "<p>Internationale gasten brengen vaak uiteenlopende voorkeuren mee. Oudere familieleden herkennen andere nummers dan vrienden die vooral op recente hits dansen. Door stijlen en periodes logisch af te wisselen kan de energie groeien, terwijl meerdere generaties zich betrokken voelen. Niet ieder verzoek hoeft direct te worden gespeeld; timing en samenhang blijven belangrijk.</p>",
    "<h2>Plan vaste momenten, maar houd ruimte</h2>",
    "<p>De openingsdans, binnenkomst en eventuele traditionele momenten verdienen vooraf duidelijke afspraken. Voor het vrije feestgedeelte is flexibiliteit juist waardevol. De reactie van de gasten bepaalt welke richting op dat moment werkt. Een voorbereiding met voorkeuren, belangrijke nummers en muziek die jullie liever niet horen geeft houvast zonder de dansvloer vast te zetten.</p>",
    "<h2>DJ-only of een complete drive-in</h2>",
    "<p>Heeft de locatie al passende techniek, dan kan een DJ-only invulling geschikt zijn. Is er nog geluid en licht nodig, dan kan een complete drive-in worden besproken. Welke vorm past, hangt af van de locatie, het aantal gasten, de speelduur en het programma. De definitieve invulling wordt daarom altijd per aanvraag bevestigd.</p>",
    "<h2>Bespreek wensen vooraf</h2>",
    "<p>Met meer dan 20 jaar ervaring als DJ bereidt DJ Elvio de muziek samen met het bruidspaar voor. Voor een gerichte bespreking zijn de datum, locatie, planning, samenstelling van de gasten en belangrijkste muzikale wensen nodig. Zo ontstaat een plan dat ruimte laat om tijdens het feest op de dansvloer te reageren.</p>",
    "<p>Willen jullie bespreken welke muzikale aanpak bij jullie internationale bruiloft past? Vraag dan vrijblijvend een offerte aan via de contactpagina.</p>",
  ].join("\n");
  const articleReview = buildArticleReview({
    opportunity: articleOpportunity, brief,
    facts: { fullBodyHtml },
    existingContent: [
      { id: "page-wedding", url: "/bruiloftsfeest", title: "Bruiloft DJ huren", description: "Commerciële servicepagina voor DJ-only en complete drive-in." },
      { id: "article-day-programme", url: "/post/dagprogramma-bruiloft", title: "Dagprogramma bruiloft", description: "Informatie over de planning van de trouwdag." },
    ],
    imagery: [],
  });
  return buildGate4DryRun({ pageReview, articleReview });
}
