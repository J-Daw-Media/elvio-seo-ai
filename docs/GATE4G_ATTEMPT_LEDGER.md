# Gate 4G attempt-aware Wix execution

Gate 4G separates permanent article identity from separately approved execution identity. It does not activate Wix writing, publishing, schedules or Gate 5.

## Collections

- `seo_wix_articles`: one article lock per editorial fingerprint and Wix site.
- `seo_wix_authorizations`: immutable one-shot owner authorizations; consumed atomically.
- `seo_wix_attempts`: append-only attempt identities and state transitions.
- `seo_wix_reconciliations`: append-only evidence resolving historical uncertainty.
- `seo_wix_draft_executions`: preserved legacy Gate 4E records; never rewritten by Gate 4G.

The production service identity requires access only to the four new Gate 4G collections and the one temporary Secret Manager version. Historical reconciliation and authorization provisioning are separate owner-approved maintenance operations.

## Production entrypoint

`node scripts/gate4g-production-one-shot.js`

The entrypoint fails closed unless `GATE4G_EXECUTION_ENABLED=true`. It loads the immutable article from `docs/gate4-dry-run.json`, obtains a Google access token from the Cloud Run metadata service, loads the pre-provisioned authorization, reserves the article and attempt transactionally, acquires the temporary Wix credential at runtime and invokes the existing corrected one-shot executor.

Required server-only variables:

- `GATE4G_EXECUTION_ENABLED`
- `GCP_PROJECT`
- `WIX_SECRET_ID`
- `WIX_SECRET_VERSION`
- `WIX_AUTHORIZATION_ID`
- `WIX_ATTEMPT_ID`
- `WIX_PARENT_ATTEMPT_ID`
- `WIX_CREDENTIAL_OPERATIONS_MODULE`

The operations module must export `revokeCredential()` and `verifyRevoked()`. It is an operational adapter for the temporary Wix key lifecycle, not part of recurring SEO jobs. Activation is prohibited until that adapter can independently revoke the Wix key and prove the revoked key no longer authenticates. Disabling only the Secret Manager version is insufficient.

For an isolated operator-run invocation, `GOOGLE_OAUTH_ACCESS_TOKEN` may contain a short-lived token issued for the dedicated execution identity. When absent, the entrypoint uses the Cloud Run metadata service. The Wix credential is passed to the revocation adapter only in memory so it can independently prove that Wix rejects the deleted key; it must never print or persist that value.

## Synthetic rehearsal

Run `npm run gate4g:rehearse`. It uses only in-memory ledgers, a synthetic credential and a simulated Wix transport. It performs one simulated POST, exact-ID GET verification, credential revocation verification and a zero-request replay.

## Preserved policy

`elvio-blog-autopilot-v1` remains disabled. Its Amsterdam-month six-slot quota, no-catch-up rule, evidence requirements, imagery requirements and emergency kill switch are unchanged.
