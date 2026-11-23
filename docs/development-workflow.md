# ELVIO SEO AI — Protected Development Workflow

Effective 23 November 2026.

## Source authority

The private GitHub repository `J-Daw-Media/elvio-seo-ai` is the remote backup and review location. Its protected `main` branch represents reviewed source history. The production Cloud Run image remains authoritative for what is executing until a separately approved deployment replaces it.

The source manifest in `docs/source-manifest-gate2.json` records the 30-file Gate 2 production source package and its fingerprint. Documentation and repository-governance files added after that baseline do not change the recorded deployed package.

## Branching and pull requests

- Do not develop directly on `main`.
- Use short-lived branches named `codex/<purpose>`.
- Keep each pull request limited to one gate or one independently reviewable correction.
- Require automated tests before merge.
- Require owner review for gate changes, new external integrations, production configuration, publishing, or data writes.
- Never force-push or delete `main`.

For a sole-owner repository, protection must preserve an emergency recovery route. Administrator bypass may remain available, but its use must be documented and followed by source and production verification.

## Required local checks

Before opening or updating a pull request:

1. Run `npm test`.
2. Run the relevant dry-run or read-only command.
3. Review the diff for credentials, generated output, customer data, mutation clients, and unauthorized gate expansion.
4. Confirm that `.env*`, credential files, logs, generated output, and production exports remain untracked.
5. Update provenance documentation when a production deployment is separately authorized.

The GitHub workflow runs the isolated Node test suite on pushes to `main` and on pull requests targeting `main`.

## Approval and deployment boundaries

A merged pull request does not authorize a deployment. The following require separate explicit owner approval:

- Cloud Run image build or deployment;
- Cloud Scheduler creation or modification;
- Search Console, GA4, Wix, Google Ads, CRM, or other permission changes;
- CRM or website writes;
- Wix drafts or publication;
- customer communications;
- activation of Gate 3 or any later gate.

Global Groove remains a separate system. Do not share its credentials, site IDs, state buckets, ledgers, schedules, or production permissions with ELVIO SEO AI.

## Release procedure

For an approved production release:

1. Record the approved commit SHA and confirm a clean source tree.
2. Run the complete regression suite and security review.
3. Build from that exact commit and record the Cloud Build ID and immutable image digest.
4. Compare the proposed configuration with the approved gate contract.
5. Deploy only the approved image using the documented Google Cloud release path.
6. Verify the image digest, service identity, feature flags, schedules, logs, and read-only behavior.
7. Record the result in a dated report and update provenance references.

## Rollback

Rollback is a separately authorized production action. Retain the previously verified image digest and job configuration. If validation fails, stop scheduled execution where authorized, restore the last known-good immutable image, verify the effective digest and configuration, and document the incident. Never rewrite Git history to represent a rollback; use a revert commit when source changes must be undone.

## Secret and data handling

- Store credentials only in the approved secrets/configuration service, never in Git.
- Do not commit raw Search Console, GA4, CRM, Wix, Google Ads, or customer exports.
- Use synthetic fixtures and privacy-safe aggregate evidence in tests and reports.
- Treat logs and generated evidence as potentially sensitive and keep them outside the tracked repository unless explicitly sanitized.

## Current gate state

- Gate 1 — SEO Derived Memory: completed.
- Gate 2 — Read-Only Organic Attribution: completed.
- Gate 3 — Review Interface Integration: not started and unauthorized.
- Gate 4 — Wix Draft Test: not started and unauthorized.
- Gate 5 — Production Instrumentation: not started and unauthorized.

The authoritative sequence is maintained in `docs/elvio-seo-ai-activation-roadmap.md`.
