# ELVIO SEO AI

Isolated SEO intelligence system for Allround DJ Elvio.

The verified production baseline is Phase 2 Gate 2. The system collects read-only Search Console and GA4 evidence and stores versioned SEO-only derived memory and attribution candidates. It does not publish Wix content, mutate Google Ads or GA4, send communications, or write CRM records.

## Safety defaults

- attribution is disabled unless an owner-triggered execution explicitly overrides `SEO_ATTRIBUTION_MODE`
- `SEO_KILL_SWITCH=true` blocks every run
- no Wix write client
- no Google Ads mutation client
- no CRM mutation client
- no credentials in source or logs

## Production provenance

- Cloud Build: `f20c205c-4c54-4b5b-b647-3016ef38a2eb`
- Image: `sha256:cdf3b27ae3d47387dbdf40169e54cf403cb3a6fa0cafb4f43e2e6301b6bd76c6`
- Authoritative gate sequence: `docs/elvio-seo-ai-activation-roadmap.md`
- Gate 3 remains unauthorized.

## Architecture

- `src/` contains the isolated SEO collection, normalization, scoring, attribution, and CLI modules.
- `vendor/` contains the exact shared pricing dependency used by the verified production image.
- `test/` contains synthetic and regression tests; production records are not used as fixtures.
- `deployment/` contains the reviewed Cloud Run job definition and deployment references.
- `docs/` contains the authoritative gate roadmap, source manifest, and operating documentation.
- `reports/` contains dated verification reports. Generated runtime evidence belongs in ignored `output/`.

The repository is intentionally separate from Global Groove, the DJ Elvio CRM, Wix publishing, and Google Ads mutation code. Credentials, site identifiers, processing ledgers, and schedules must remain isolated.

## Local development

Requirements: Node.js 22 or later. This baseline has no third-party runtime package installation step.

```text
npm test
npm run check
```

`npm test` runs the isolated synthetic regression suite. `npm run check` is a dry run and must remain non-mutating. Never place credentials or production exports in this repository.

## Git and review workflow

1. Start from the current protected `main` branch.
2. Create a short-lived `codex/<purpose>` branch.
3. Make narrowly scoped changes and add or update tests.
4. Run `npm test` and the relevant dry-run verification locally.
5. Push the branch and open a pull request.
6. Merge only after successful checks and an owner review appropriate to the gate.

Direct production deployment is not part of a normal source merge. Do not force-push or delete `main`. See `docs/development-workflow.md` for the complete release and rollback boundaries.

## Deployment boundary

GitHub is the protected source backup and review system. A push or merge must not deploy automatically. Production changes require a separately approved release task, exact source/image provenance, successful regression evidence, and post-deployment read-only verification.

The current verified production reference is Cloud Build `f20c205c-4c54-4b5b-b647-3016ef38a2eb` and image digest `sha256:cdf3b27ae3d47387dbdf40169e54cf403cb3a6fa0cafb4f43e2e6301b6bd76c6`. These are provenance references, not deployment instructions.
