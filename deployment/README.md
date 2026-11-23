# Deployment preparation — not executed

No Google Cloud resource, permission, secret, deployment or schedule was created during Phase 0/1 local implementation.

## Proposed isolated resources

- Cloud Run Job: `elvio-seo-ai`
- Service account: `elvio-seo-ai@crm2026-497707.iam.gserviceaccount.com`
- Secret Manager entries: dedicated Search Console/GA authorization only; never reuse Global Groove publishing credentials
- Firestore namespace: `elvio_seo_ai_*`
- Cloud Storage prefix: `elvio-seo-ai/`
- Weekly Scheduler: Monday 08:00 Europe/Amsterdam
- Monthly review Scheduler: first Monday 09:00 Europe/Amsterdam

## Default environment

```text
SEO_DRY_RUN=true
SEO_KILL_SWITCH=false
SEO_PERSISTENT_WRITES_ENABLED=false
SEO_SEARCH_CONSOLE_PROPERTY=sc-domain:djelvio.nl
SEO_GA4_PROPERTY=486194389
SEO_WIX_SITE_ID=fe9762c6-cdbd-404c-ba42-c2b834b052e2
```

`SEO_PERSISTENT_WRITES_ENABLED` remains false until Firestore/Storage IAM, retention, logging and cost limits are separately approved. Wix writes are not implemented in this phase.

## Approval-gated activation sequence

1. Reauthenticate Google Cloud administration.
2. Verify whether Search Console API and Analytics Data API are enabled.
3. Obtain owner approval before enabling a missing API or creating IAM/service accounts/secrets.
4. Grant only Search Console read-only and GA4 Viewer/Data API access.
5. Create isolated Firestore/Storage permissions; no access to Global Groove paths.
6. Deploy with `SEO_DRY_RUN=true` and persistence disabled.
7. Run one owner-triggered collection and inspect redacted logs/cost.
8. Separately approve persistent snapshots.
9. Separately approve each recurring Scheduler job.

## Monitoring and kill switch

- `SEO_KILL_SWITCH=true` stops collection before any collector runs.
- Alert on failed runs, quota exhaustion, unexpected write attempts and any PII-redaction violation.
- Set a monthly budget alert well below the planning ceiling; this document does not authorize spend.
- Retain execution summaries without queries tied to people or CRM PII.
