# Dedicated publisher production boundary

The autonomous publisher runs as a separate Cloud Run Job named `elvio-seo-publisher` in `europe-west4`.

It uses the same immutable container image as the collector, but overrides the command to:

```text
node scripts/run-production-publisher.js
```

## Runtime isolation

- Identity: `elvio-seo-publisher@crm2026-497707.iam.gserviceaccount.com`
- Wix secret: secret-level access to `elvio-seo-wix-publisher` only
- Evidence and ledgers: Firestore and the existing SEO Storage bucket only
- Generation: Vertex AI model invocation only
- No CRM, Google Ads, newsletter, payment, Gmail, or Global Groove access
- The collector identity does not receive Wix secret access

Firestore IAM does not provide collection-level permissions. The publisher therefore has residual database-level access through its runtime role. Application allowlists and tests restrict the process to the `elvio_seo_ai_*` collections, but this is not presented as collection-level IAM isolation.

## Safe defaults

```text
BLOG_AUTOPILOT_MODE=readiness
BLOG_AUTOPILOT_KILL_SWITCH=true
BLOG_GENERATION_MODEL=gemini-3.8-flash
WIX_PUBLISHER_SECRET=elvio-seo-wix-publisher
```

The production Scheduler is created disabled until a monitored autonomous trial has passed. No catch-up run is permitted.

## Emergency stop

An authenticated operator immediately stops future writes by setting `BLOG_AUTOPILOT_KILL_SWITCH=true` and pausing the Scheduler. If credential compromise is suspected, disable or destroy the active Wix secret version after the job is stopped. Historical ledgers and Wix posts must not be deleted during incident handling.

Resume only after the incident is reconciled, the credential is healthy, the kill switch has been tested, and the next normal policy slot is still valid.

## Sanitized security note

Authorization-header values previously observed in unrelated social-publishing output are excluded from this runtime and must be remediated separately. They must not be copied into this repository, Secret Manager entry, environment configuration, logs, or reports.
