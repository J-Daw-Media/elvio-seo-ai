# ELVIO SEO AI Phase 2 — Technical SEO Diagnostic

**Mode:** Read-only live crawl  
**Date:** 23 November 2026  
**URLs in sitemap inventory:** 27  
**Duplicate titles:** 0  
**Duplicate descriptions:** 0

## Confirmed URL-level findings

| URL | HTTP | Canonical | Finding | Current schema | Confidence | Recommended next action |
|---|---:|---|---|---|---|---|
| `/blog` | 200 | self | Missing H1 | none detected | High | Add one truthful visible H1 after approval |
| `/bruiloftsfeest` | 200 | self | Missing H1 | Service, Person, Country, ServiceChannel | High | Add one descriptive wedding H1 after approval |
| `/` | 200 | self | Two H1 elements | LocalBusiness, WebSite, Organization, Service and related types | High | Identify both visible H1s and retain one primary H1 |
| `/inquiry-services-page` | 200 | self | Missing meta description | none detected | High | Confirm whether page is intended for search; then add metadata or noindex only with approval |
| `/sportevenement` | 200 | self | Missing H1 | Service, Person, Country, ServiceChannel | High | Add one descriptive sports-event H1 after approval |
| `/bedrijfsfeest` | 200 | self | Missing H1 | Service, Person, Country, ServiceChannel | High | Add one descriptive corporate-event H1 after approval |
| `/fotovideo` | 200 | self | Missing H1; Event schema present | Person, Event, MusicGroup, ContactPoint | High | Inspect Wix schema source; evergreen gallery content does not currently evidence a scheduled Event |
| `/faq` | 200 | self | Three H1 elements | Person, MusicGroup, ContactPoint | High | Retain one page H1 and use lower heading levels for sections |

## Event enhancement investigation

The current rendered site exposes `Event` markup on `/fotovideo`. The page is an evergreen photo/video page and the crawl did not establish a real scheduled event. The truthful proposal is to remove Event markup from that page and use only schema supported by visible content. The earlier six invalid enhancements may represent multiple Event entities or stale Search Console processing; they are not evidence of six currently affected URLs.

No schema was changed.

## Indexing backlog

The earlier report listed eight discovered-not-indexed URLs, three crawled-not-indexed URLs, four noindex exclusions, and three redirects. The sitemap crawl alone cannot map those Search Console groups to exact URLs. A fresh read-only URL Inspection/API or Search Console export is required. Until then each item remains **PARTIAL / UNVERIFIED CURRENT STATE**. No indexing request, noindex removal, redirect edit, canonical change, or sitemap change was performed.

## Evidence artifact

The machine-readable crawl is stored at `output/technical-audit-2026-11-23.json`.
