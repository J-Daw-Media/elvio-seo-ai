# ELVIO SEO AI — Source Governance Recovery Report

Date: 23 November 2026 (Europe/Amsterdam)

## 1. Overall decision

**GO.** A dedicated local Git repository now protects the verified Gate 2 source baseline. No production deployment, configuration, data, permission, schedule, website, advertising account, CRM record, communication, or Global Groove resource was changed.

## 2. Authoritative source

Source path and Git root:

`C:\Users\Redux Gamer\.codex\.chatgpt-projects\g-p-6a5e7199cbd48191ab68985dbb21ff85\elvio-seo-ai`

The directory contains the active application source, tests, scripts, reviewed documentation, and a provenance copy of the shared pricing dependency. It is now a dedicated nested repository and no longer relies on the accidental uncommitted Git repository at the Windows user-directory level.

No newer ELVIO SEO AI source was found in the other available ChatGPT project root or the DJ Elvio application repository.

## 3. Git baseline

- Default branch: `main`
- Baseline commit: `ebed19ce1611fb190173da24ec46b99a9399e943`
- Baseline message: `chore: establish verified Gate 2 production source baseline`
- Commit identity: local-only `Codex <codex@local.invalid>`
- Remote: none

No repository was published or pushed.

## 4. Source manifest and production comparison

Manifest:

`docs/source-manifest-gate2.json`

- Source-package files: 30
- Source-package fingerprint: `c4d1b0ed73719d68be2e23750cbbde6854829982820847c85296b225a8f04a36`
- Gate 2 Cloud Build: `f20c205c-4c54-4b5b-b647-3016ef38a2eb`
- Production image: `sha256:cdf3b27ae3d47387dbdf40169e54cf403cb3a6fa0cafb4f43e2e6301b6bd76c6`

Every manifest file matched the preserved Gate 2 build package by relative build path, byte size, and SHA-256 hash. The exact path mapping is documented, including `vendor/pricing.js` corresponding to build-context `src/pricing.js`.

This proves exact equivalence of the reviewed source-package inputs retained locally. It does not independently prove full bit-for-bit container reproducibility because the base image, Docker builder implementation, and remote build environment are external inputs. The immutable Cloud Build ID and deployed image digest remain the authoritative container evidence.

## 5. Shared pricing dependency

The deployed Docker build used the parent-workspace file `src/pricing.js`. Its exact Gate 2 version is now retained as `vendor/pricing.js` with SHA-256:

`44f420a176e73a786f16c70e8419d930d7c32828d58804f6615ffb1402bc55d9`

The copy is provenance evidence only. Runtime imports, Docker configuration, and production were not changed.

## 6. Secret scan

Reviewed staged files contained:

- Private keys: 0
- Google API keys: 0
- GitHub tokens: 0
- JWT-shaped credentials: 0
- Sensitive filenames: 0

Two broad assignment-pattern matches were reviewed manually. Both are deliberately synthetic authentication-test fixtures (`synthetic` and `scoped-token`) and are not credentials.

No secret value was committed.

## 7. Ignore and exclusion policy

`.gitignore` excludes:

- `node_modules`, coverage, caches, build and distribution output
- local generated `output/` evidence
- temporary directories and logs
- `.env` and local configuration files
- private keys and certificate containers
- credential and service-account JSON files
- editor and operating-system metadata

Tracked content is limited to reviewed source, tests, scripts, safe deployment examples, documentation, historical reports, and the reviewed pricing dependency.

## 8. Obsolete Phase 1B staging copy

Obsolete directory:

`tmp/elvio-seo-ai-phase1b-build/elvio-seo-ai`

Verification found:

- It has 20 files versus the active source tree's complete implementation.
- It predates Gate 1 and Gate 2.
- It is not referenced by active source or deployment scripts.
- Cloud Run rollback uses immutable image digests, not this folder.
- No active automation points to it.
- It is not authoritative.

It remains untouched and is excluded from the dedicated repository. Archival or deletion can be considered separately.

## 9. Corrected gate roadmap

Authoritative roadmap:

`docs/elvio-seo-ai-activation-roadmap.md`

1. Gate 1 — SEO Derived Memory: completed
2. Gate 2 — Read-Only Organic Attribution: completed
3. Gate 3 — Review Interface Integration: not started
4. Gate 4 — Wix Draft Test: not started
5. Gate 5 — Production Instrumentation: not started

The incorrect alternative numbering in the historical Gate 1 report remains preserved as audit evidence and is explicitly superseded by the roadmap.

## 10. Test evidence

Before baseline creation, the existing complete repository command exited successfully. The latest complete regression evidence remained 1,970 passed, zero failed, and two intentional skips.

After baseline creation, the dedicated ELVIO SEO AI suite passed:

- Tests: 53
- Passed: 53
- Failed: 0
- Skipped: 0

No application source or test logic changed during governance recovery. Documentation, ignore rules, Git metadata, provenance evidence, and the exact pricing dependency copy were added.

## 11. Remote repository assessment

The connected GitHub search did not identify a dedicated `elvio-seo-ai` repository. The existing DJ Elvio application repository is a different application and should not silently become the SEO source of truth.

Recommended future remote:

- Name: `elvio-seo-ai`
- Visibility: private
- Default branch: `main`

Creating or pushing that remote requires separate owner approval.

## 12. Unresolved risks

1. The repository currently exists only on this computer; no remote backup exists.
2. The original deployment build layout depended on a parent-workspace pricing file. Its exact copy is now retained, but a future separately reviewed build-layout improvement would be needed for a fully standalone build command.
3. Historical deployment documents describe earlier states. They are retained intentionally and must not be mistaken for the authoritative roadmap or current production configuration.
4. Container reproducibility is supported by source hashes, Cloud Build ID, and image digest, but is not a formal hermetic or reproducible-build guarantee.

## 13. Recommended next step

Request separate approval to create a private `elvio-seo-ai` GitHub repository and push `main`. After remote backup and branch protection are established, Gate 3 may be considered through a new branch and review workflow.

Gate 3 remains unauthorized.
