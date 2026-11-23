# ELVIO SEO AI — Phase 0 + Phase 1 Implementation Report

**Date:** 23 November 2026  
**Release state:** Local, read-only foundation; not deployed  
**External changes:** None

## Architecture and implementation summary

The implementation is an isolated Node.js package under `elvio-seo-ai`. It copies no Global Groove runtime state and has no dependency on Global Groove or the production DJ Secretary. Data sources are modular collectors; each collector returns provenance-rich evidence and fails independently. Deterministic IDs support deduplication and idempotent snapshots. Safety controls default to dry-run, expose a kill switch and make every business mutation unavailable.

Prepared production shape, not created:

- Cloud Run Job: `elvio-seo-ai`
- dedicated runtime identity: `elvio-seo-ai@crm2026-497707.iam.gserviceaccount.com`
- dedicated Secret Manager entries
- Firestore records prefixed/namespaced `elvio_seo_ai_*`
- Cloud Storage prefix `elvio-seo-ai/`
- weekly collection and monthly review schedules in Europe/Amsterdam

There is deliberately no Wix writer, Google Ads mutation client, CRM writer, article generator or publishing scheduler.

## Files and modules

| Path | Purpose |
|---|---|
| `src/safety.js` | Dry-run, kill switch and mutation denial |
| `src/identity.js` | Deterministic stable identifiers |
| `src/evidence.js` | Provenance, confidence and privacy-safe evidence |
| `src/collectors/searchConsole.js` | Read-only Search Console query collector |
| `src/collectors/ga4.js` | Read-only GA4 organic traffic collector |
| `src/collectors/adapters.js` | Read-only Ads and CRM evidence adapters |
| `src/memory.js` | Idempotent snapshot interfaces and guarded persistence |
| `src/scoring.js` | Explainable opportunity model |
| `src/pricingContext.js` | Runtime import of authoritative application pricing and conflict detection |
| `src/wixContract.js` | Future Draft Post contract with writes blocked |
| `src/technicalAudit.js` | Sitemap and page metadata audit |
| `src/engine.js` | Collector orchestration and source isolation |
| `scripts/run-technical-audit.js` | Read-only website audit runner |
| `scripts/build-opportunity-baseline.js` | Deterministic opportunity artifact |
| `deployment/README.md` | Proposed resource isolation and approval boundary |
| `deployment/schedules.example.json` | Disabled schedule definitions |
| `test/*.test.js` | Safety, collector, scoring, privacy and audit tests |

## API authorization status

| Integration | Status | Evidence / blocker |
|---|---|---|
| Search Console UI | VERIFIED | `sc-domain:djelvio.nl` accessible; performance and indexing data reviewed |
| Search Console API | PREPARED, NOT VERIFIED | Collector exists; Cloud SDK account requires reauthentication and runtime IAM/API enablement needs approval |
| GA4 UI | VERIFIED | Property `486194389` accessible; organic acquisition and events reviewed |
| GA4 Data API | PREPARED, NOT VERIFIED | Collector exists; read-only runtime identity not authorized |
| Google Ads intelligence | PARTIALLY VERIFIED | Existing read-only evidence can be adapted; no campaign mutation path exists here |
| CRM booking evidence | PARTIALLY VERIFIED | Read-only adapter contract exists; attribution link remains incomplete |
| Wix Blog Draft Posts | CONTRACT ONLY | Site ID recorded; `Manage Blog` permission would be required later; all writes throw |

## Test and regression results

- ELVIO SEO AI: **19/19 passed**, 0 failed.
- Dry-run smoke check: completed with **0 writes** and **0 external mutations**.
- Existing workspace regression: **1,809 passed, 0 failed, 2 skipped** out of 1,811.
- Global Groove reference suite baseline: **174/174 passed**; its runtime was not modified.

The implementation is not declared production-ready because API authorization, cloud isolation and logging/cost controls have not been validated in a deployed runtime.

## Deployment readiness

**GO for owner review and read-only authorization. NO-GO for deployment or recurring scheduling today.**

Required before deployment:

1. Reauthenticate the approved Google Cloud administrator.
2. Approve and create the dedicated least-privilege runtime identity.
3. Confirm Search Console and GA4 read-only API access.
4. Approve Secret Manager, Firestore/Storage namespace and Cloud Run Job creation.
5. Validate logs contain no PII or credentials.
6. Run the collectors in dry-run and compare their results with the UI baseline.
7. Approve schedules only after cost and failure monitoring are demonstrated.

## Security and cost assessment

- External scopes are designed as read-only.
- No credentials are stored in source or output.
- Evidence redaction rejects common email, phone and secret patterns.
- Collector failures remain isolated.
- Kill switch and dry-run are tested.
- Persistent writes require a separate explicit gate.
- Wix publishing, Ads changes, CRM changes and customer communications are structurally absent.

Expected incremental cost remains low at weekly/monthly frequency. A prudent initial envelope is **€0–€6/month** for execution and compact storage before any AI drafting is introduced. The earlier broader planning range of **$6–$35/month** remains an upper planning estimate for later phases, not spending authorization.

## Outstanding blockers

1. **Cloud reauthentication:** active account is visible, but service inspection requires reauthentication.
2. **API permissions:** Search Console and GA4 UI access do not prove runtime API access.
3. **Attribution:** GA4 currently shows no key events in the reviewed snapshot; organic inquiry-to-booking attribution is not established.
4. **Wix:** no permission or write test is appropriate in Phase 0/1.

Resolved on 23 November 2026: corporate events up to 50 guests now use the owner-approved €650 starting price in `src/pricing.js`.

## Recommended Phase 2 scope

After separate approval:

1. Authorize and validate the two read-only Google APIs.
2. Deploy the isolated job in dry-run with bounded costs and monitoring.
3. Add immutable performance snapshots and weekly/monthly report generation.
4. Implement validated organic inquiry and booking attribution in the existing CRM path.
5. Prepare owner-reviewed page optimization drafts for the top opportunities.

Phase 2 must still exclude autonomous Wix publication. Wix draft creation and publishing require separate authorization.
