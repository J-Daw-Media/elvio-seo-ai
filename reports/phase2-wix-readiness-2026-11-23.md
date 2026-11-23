# ELVIO SEO AI Phase 2 — Wix Publishing Readiness

## Verified contract

- DJ Elvio site ID: `fe9762c6-cdbd-404c-ba42-c2b834b052e2`
- Candidate API: Wix Blog Draft Posts API, `https://www.wixapis.com/blog/v3/draft-posts`
- Required content: title, slug, excerpt, rich content, SEO title/description, optional approved media
- Draft identity: deterministic ID from immutable content fingerprint
- Duplicate protection: title/slug checks plus content fingerprint
- Approval: immutable fingerprint; any content change invalidates approval
- Verification: retrieve draft, compare fingerprint/fields, publish only under separate authorization, then verify public URL
- Rollback: archive/unpublish only after exact identity and public-state verification

## Implemented locally

- Validated dry-run Wix payload generation
- Deterministic draft ID and fingerprint
- SEO metadata mapping
- Rich-content placeholder mapping
- Optional approved-image association
- Explicit `writesPerformed: 0`
- Hard write prohibition: `WIX_PHASE2_WRITES_NOT_AUTHORIZED`

## Not activated

- No Wix access token or secret was added.
- No live draft was created.
- No page or Blog content was changed.
- No publishing or unpublishing capability was enabled.

Before activation, owner approval is required for minimum Wix permissions, one exact draft-write test, verification, rollback procedure, and separate publishing authority.
