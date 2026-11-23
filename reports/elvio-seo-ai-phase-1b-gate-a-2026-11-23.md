# ELVIO SEO AI — Phase 1B Gate A Report

**Date:** 23 November 2026  
**Status:** Gate A passed; Gate B awaits explicit owner approval  
**Production changes:** None

## Gate A results

- Existing package reused; no feasibility work repeated.
- Corporate price reference resolves from the authoritative production module as €650 up to 50 guests and €750 for 51–100 guests.
- Dry-run, kill switch and persistent-write gate remain enforced.
- No Wix writer, Ads mutation client, CRM writer or customer communication path exists.
- No dependency on Global Groove runtime state or credentials exists.
- Credential-pattern scan found no embedded credential values.
- Evidence output redacts common PII and secrets.
- Collector failures remain isolated.
- Added bounded retries for temporary 408/429/5xx failures; permanent authorization errors are not retried.
- Added measurement periods and collection versions to evidence records.
- Added idempotent checkpoint recovery semantics.
- Added metadata-based runtime authentication and aggregate-only job output.
- Added isolated Docker/Cloud Build preparation; no image was built or pushed.

## Validation

- ELVIO SEO AI: 25/25 tests passed.
- Full workspace regression: 1,942 passed, 0 failed, 2 skipped out of 1,944.
- Dry-run smoke check: zero writes and zero external mutations.
- Local Docker runtime is unavailable, so container execution awaits the approval-gated Cloud Build candidate.

## Current Google Cloud facts

- Project billing is enabled.
- Search Console API: not enabled.
- Analytics Data API: not enabled.
- Cloud Run, Firestore, Storage, Secret Manager, Scheduler and Monitoring APIs: enabled.
- Dedicated `elvio-seo-ai` service account: not found.
- Cloud Run Job `elvio-seo-ai`: not found.
- SEO Scheduler jobs: not found.
- Existing Global Groove bucket and service account are separate and will not be used.

## Exact Gate B/C approval requested

1. Enable `searchconsole.googleapis.com` and `analyticsdata.googleapis.com` in `crm2026-497707`.
2. Create service account `elvio-seo-ai@crm2026-497707.iam.gserviceaccount.com`.
3. Grant logging/monitoring writer permissions and only the minimum storage permissions required for a dedicated SEO bucket.
4. Create a dedicated regional bucket `crm2026-497707-elvio-seo-ai` in `europe-west4`; persistence remains disabled during the first run.
5. Build the prepared container and create Cloud Run Job `elvio-seo-ai` with `SEO_DRY_RUN=true`, `SEO_PERSISTENT_WRITES_ENABLED=false` and no scheduler.

After the service account exists, the owner must add it as:

- a read-only user of Search Console property `sc-domain:djelvio.nl`;
- a Viewer on GA4 property `486194389`.

The first job execution will occur only after both product-level permissions are confirmed. Scheduler creation remains a later, separate approval gate.

## Incremental cost estimate

- Enabling APIs and creating a service account: no direct usage fee expected.
- Cloud Build candidate: typically negligible for this small image and may fall within existing allowance.
- Cloud Run Job: near-zero at one manual dry-run and low-frequency execution.
- Dedicated bucket: pennies per month for compact snapshots; writes remain disabled initially.
- Scheduler: not approved or created; a later job is commonly about $0.10/month after any billing-account free allowance.

Planning envelope remains €0–€6/month. This report does not authorize spending beyond the named resources.
