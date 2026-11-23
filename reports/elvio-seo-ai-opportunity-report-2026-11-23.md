# ELVIO SEO AI — SEO Opportunity Report

**Date:** 23 November 2026  
**Mode:** Read-only baseline; no publication, configuration change, or external write  
**Evidence window:** Search Console 4–21 November 2026; GA4 last 7 days and yesterday snapshots

## 1. Executive summary

DJ Elvio already has a technically discoverable Wix site, a verified Search Console property and an accessible GA4 property. The clearest near-term opportunity is improving existing commercial pages rather than producing articles at volume. Search Console shows demand for DJ pricing, Amsterdam, weddings, company parties and sports events, but several relevant pages received impressions without clicks.

The local ELVIO SEO AI foundation is ready for review. It is isolated, dry-run by default, deterministic, privacy-safe and incapable of publishing to Wix. Live API collection and cloud scheduling are not activated. The recommended next phase is read-only API authorization, followed by owner-approved page improvements.

**Status:** Phase 0/1 local foundation **COMPLETED**; live collectors **PREPARED**; cloud deployment and API authorization **REQUIRES OWNER APPROVAL**.

## 2. Technical health

**VERIFIED**

- `robots.txt` permits normal crawling and excludes Wix lightbox parameter URLs.
- Sitemap index exposes page, blog-post and blog-category sitemaps; 27 URLs were audited.
- No duplicate titles or duplicate meta descriptions were found in the fetched HTML.
- Search Console reports 16 indexed and 18 not indexed URLs (updated 16 November 2026).
- Search Console reports six invalid Event rich-result items, all missing `location` and `startDate`.

**PARTIALLY VERIFIED**

- Static HTML audit found five URLs without a detectable H1, one missing meta description and two with multiple H1s. Wix rendering can differ from fetched HTML, so the five missing-H1 findings require rendered-DOM confirmation before editing.
- Of 18 non-indexed URLs: four are excluded by `noindex`, three are redirects, eight are discovered but not indexed and three are crawled but not indexed. The exact excluded URLs need a URL-level review before deciding whether this is intentional.
- The Event structured data may be conceptually inappropriate on service/content pages. Do not invent event dates or locations merely to satisfy validation; first identify the template injecting the schema.

Technical evidence: `output/technical-audit-2026-11-23.json`.

## 3. Search Console baseline

**VERIFIED in the live Search Console UI; API collection not yet authorized**

Three-month headline snapshot: **12 clicks, 494 impressions, 2.4% CTR, average position 26.3**.

| Query | Clicks | Impressions | Interpretation |
|---|---:|---:|---|
| dj elvio | 7 | 19 | Brand demand; protect and monitor |
| dagprogramma bruiloft | 0 | 46 | Strong informational demand; existing article can be refreshed |
| sport event dj | 0 | 41 | Relevant service demand; page has no recorded clicks |
| dj prijs per uur | 0 | 33 | High commercial intent; improve price-page snippet and content |
| dj huren amsterdam | 0 | 28 | High local-commercial intent; current coverage is too broad |
| dj met violist | 0 | 16 | Adjacent service query; verify actual offering before action |
| all-in trouwfeest dj pakket | 0 | 13 | High wedding intent; clarify package inclusions |
| dj personeelsfeest | 0 | 11 | High corporate intent; improve company-party page |
| prijs dj | 0 | 10 | Supports the pricing opportunity |

Relevant page evidence includes: homepage 96 impressions/9 clicks; location-size article 92/1; day-program article 61/1; price page 68/0; company-party page 63/0; sports-event page 45/0; Netherlands DJ page 42/0.

## 4. GA4 organic baseline

**VERIFIED in the live GA4 UI; API collection not yet authorized**

- Yesterday: 22 active users, 95 events, 43 views and **0 key events**.
- Last seven days: Paid Search 68 sessions, Direct 48, Organic Search 4, Organic Social 1 and Referral 1.
- GA4 recommends treating visits/actions around `/contact` as a possible `generate_lead` signal, but no change has been made.

Organic traffic is currently too small, and conversion measurement too incomplete, to make reliable revenue claims. The system must not optimize on impressions alone.

## 5. Content and indexing inventory

**VERIFIED/PARTIALLY VERIFIED**

- Wix exposes service pages and native blog URLs through separate sitemap groups.
- Existing pages already cover weddings, company parties, sports events, DJ pricing and general DJ hire.
- The safest early work is improving those existing assets and their snippets, then filling only proven local or event-intent gaps.
- Eleven Google-selected exclusions (eight discovered and three crawled) need URL-level triage.
- Four `noindex` and three redirect exclusions should be checked against intent, not automatically reversed.

## 6. Highest-value keyword and topic opportunities

The deterministic score combines first-party demand, commercial intent, coverage gap, feasibility, evidence confidence, geography, seasonality and potential booking value. It ranks work; it does not predict revenue.

| Priority | Opportunity | Score | Evidence |
|---:|---|---:|---|
| 1 | DJ hire Amsterdam | 81 | 28 query impressions, 0 clicks; strong local-commercial intent |
| 2 | DJ price per hour and inclusions | 79 | 43 query impressions across two price terms; price page 68 impressions, 0 clicks |
| 3 | All-in wedding DJ package | 73 | 13 high-intent impressions; existing wedding page |
| 4 | Company/personnel party DJ | 71 | 11 query impressions; company page 63 impressions, 0 clicks |
| 5 | Sport-event DJ | 70 | 41 query impressions; service page 45 impressions, 0 clicks |
| 6 | Wedding day programme refresh | 66 | 46 query impressions; existing article already receives clicks |
| 7 | Small birthday/private-party DJ | 53 | Commercial fit but insufficient first-party search evidence; provisional |

Machine-readable evidence: `output/opportunities-2026-11-23.json`.

## 7. Competitor observations

**VERIFIED as public-page observations; competitor traffic and conversion are NOT FOUND**

- Competitors commonly separate wedding, birthday, corporate and location intent into dedicated pages.
- Price guides explain what is included, duration and equipment rather than showing a bare number.
- Local Amsterdam landing pages and detailed FAQs are common patterns.
- Public price claims vary widely and cannot be treated as verified market averages or evidence of competitor performance.

These observations support clearer service/package explanations, but first-party Search Console and booking evidence should remain the primary decision inputs.

Representative public sources: [EuroActs pricing guide](https://euroacts.nl/prijzen-gids/wat-kost-een-dj/), [Bandspot wedding DJ page](https://bandspot.nl/artiesten/dj/bruiloft), [DJ Armara pricing guide](https://www.djarmara.com/wat-kost-een-dj/), [DJ Huren Voor Feest wedding cost guide](https://djhurenvoorfeest.nl/nieuws/kosten-bruiloft-dj/).

## 8. Attribution readiness

**PARTIALLY VERIFIED**

Search Console can show query/page discovery and GA4 can show sessions, but GA4 currently records zero key events in the reviewed snapshot. A reliable path from organic page to inquiry to confirmed booking is therefore not established.

Smallest safe extension:

1. Preserve first-party landing page, referrer and UTM fields at Wix form submission.
2. Assign or retain one stable inquiry/event ID through CRM, quotation and booking records.
3. Record `generate_lead` only after a validated form submission, not a page view.
4. Record confirmed booking and attributable revenue in the existing CRM, linked by the stable ID.
5. Never backfill an organic source when historical evidence is absent.

No implementation or data migration was performed.

## 9. Top 10 recommendations

| # | Recommendation | Evidence/confidence | Benefit | Effort | Approval |
|---:|---|---|---|---|---|
| 1 | Fix or remove inappropriate Event schema | 6 invalid items; high | Cleaner rich-result health | Medium | Wix change approval |
| 2 | Improve pricing page title, snippet, inclusions and FAQ | 68 page impressions/0 clicks; high | More qualified commercial visits | Medium | Content approval |
| 3 | Create or adapt an Amsterdam-focused service page | 28 query impressions/0 clicks; medium-high | Local inquiries | Medium | Page approval |
| 4 | Improve wedding package explanation | 13 high-intent impressions; medium | Wedding inquiries | Medium | Content approval |
| 5 | Improve company/personnel-party page | 63 page impressions/0 clicks; high | Corporate inquiries | Medium | Content approval |
| 6 | Refresh the wedding day-program article and internal links | 46 query impressions; high | Informational-to-commercial path | Low-medium | Content approval |
| 7 | Improve sport-event page snippet and relevance | 45 page impressions/0 clicks; medium-high | Event inquiries | Low-medium | Content approval |
| 8 | Review 11 Google-selected indexing exclusions | Search Console; high | Recover intended indexable pages | Low | Read-only first; changes need approval |
| 9 | Implement validated lead and booking attribution | GA4 shows 0 key events; high | Measure bookings/revenue, not impressions | Medium-high | Instrumentation approval |
| 10 | Authorize read-only GSC/GA4 API collectors | UI access verified, API auth missing; high | Repeatable baselines and trend reports | Low-medium | IAM/API approval |

## 10. First-month content briefs

These are briefs only; no article or page copy was generated.

1. **Price-page improvement:** answer “what does a DJ cost per hour?” while explaining duration, preparation, DJ-only versus complete drive-in, travel and event-specific variables. Use the owner-approved corporate starting price of €650 for up to 50 guests.
2. **Amsterdam commercial landing page:** explain service area, event types, preparation and technical options without inventing local venues, offices or availability.
3. **Wedding all-in package update:** define what “all-in” includes, distinguish DJ-only from drive-in and add factual FAQs.
4. **Company/personnel-party update:** focus on professional preparation, mixed audiences, technical flexibility and clear inquiry CTA.
5. **Wedding day-program refresh:** improve structure, link naturally to wedding DJ service, and retain informational usefulness.

## 11. Risks and prerequisites

- **RESOLVED:** Corporate events up to 50 guests use the owner-approved starting price of €650 in the authoritative pricing module.
- **REQUIRES APPROVAL:** read-only service identity/IAM, Search Console API, GA4 Data API, Secret Manager, Cloud Run deployment and schedules.
- **RISK:** static Wix HTML can differ from rendered pages; verify template findings visually before editing.
- **RISK:** Event schema should not be “repaired” with fabricated fields if the content is not an actual scheduled event.
- **RISK:** current GA4 configuration does not yet prove inquiry or booking attribution.
- **SAFETY:** no Wix write client, Ads mutation path, CRM writer or autonomous publisher exists in this package.

## 12. Incremental cost estimate

**ESTIMATE, not a bill or quote**

- Local/read-only foundation: no incremental cloud cost.
- Weekly/monthly low-frequency Cloud Run jobs: likely within existing free/low-use allowances; budget approximately €0–€5/month depending on runtime and region.
- Firestore/Storage for compact snapshots and ledgers: likely under €1/month at low frequency.
- Search Console and GA4 APIs: no usage fee expected, subject to quotas.
- AI inference: not activated in Phase 0/1. A later low-frequency briefing/drafting phase should have a separately capped budget.
- Wix: expected to use the existing plan/integration; no new paid service demonstrated as necessary.

No billable resource, API, identity, secret, deployment or schedule was created.
