# Gate 4 Wix draft readiness

## Verified boundaries

- Target site ID: `fe9762c6-cdbd-404c-ba42-c2b834b052e2`.
- DJ Elvio has an operational native Wix Blog and public `/post/...` article routes.
- Draft creation contract: `POST https://www.wixapis.com/blog/v3/draft-posts` with `publish: false`.
- Draft retrieval contract: `GET https://www.wixapis.com/blog/v3/draft-posts/{draftPostId}`.
- Wix assigns the draft ID. The internal deterministic ID is only a fingerprint mapping key.
- Create Draft Post requires `Manage Blog`; retrieval supports `Read Draft Blog Posts`.
- `Manage Blog` also permits publication. Wix does not expose a narrower create-only scope in the verified API contract. A live credential therefore requires a separately approved risk decision and server-side endpoint allowlisting.
- No Wix credential is configured by Gate 4 development. No draft or publication occurred.

## Proposed credential model for the separately approved live test

1. Create a DJ-Elvio-only site API key, never a Global Groove credential.
2. Restrict it to the DJ Elvio site and only the required Blog permissions.
3. Store it in Google Secret Manager; never return it to a browser.
4. Give only an isolated one-shot draft-creation service access to that secret.
5. Do not attach the secret to the scheduled SEO research job.
6. Enforce an outbound allowlist containing only the exact create endpoint and exact get-by-ID endpoint.
7. Reject `/publish`, update, bulk, trash, delete, scheduling, CMS, and page-management operations.
8. Record the content fingerprint, returned Wix ID, request time, response status, and retrieval verification without logging the credential or article body.
9. Revoke the API key in Wix and remove the secret version after the controlled test if no ongoing draft workflow is approved.

## Idempotency and uncertain outcomes

Wix creates a new draft on every successful create request, even for identical content. Before a live call, the execution record must be absent for the approved content fingerprint. After a response, the returned Wix ID must be saved before any retry. If the response is uncertain, the system must reconcile by querying draft records and comparing the exact fingerprint-bearing metadata before retrying. It must never blindly issue another create request.

## Global Groove isolation

Global Groove remains a separate application, repository, site, credential set, CMS collection, schedule, state ledger, and publication workflow. Only the design patterns for validation, duplicate prevention, checkpoints, and recovery were reused conceptually. No Global Groove file or configuration was changed.

## Live-test stop conditions

Stop before any Wix write when:

- the owner has not approved the exact article and content fingerprint;
- the target site ID differs;
- the key grants access beyond the approved site;
- the draft-create endpoint or `publish: false` cannot be guaranteed;
- a duplicate fingerprint or similar draft exists;
- imagery rights are unverified;
- validation is not clean;
- an earlier response remains uncertain;
- the retrieval check cannot prove the draft is unpublished.

