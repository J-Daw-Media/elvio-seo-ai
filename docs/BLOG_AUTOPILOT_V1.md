# ELVIO blog autopilot v1

Policy: `elvio-blog-autopilot-v1`.

This package is development-only. It does not create schedules, Wix credentials, drafts, publications, CRM writes, advertising mutations, or customer communications.

## Operating policy

- Future operating mode: full autopilot after staged production approval.
- Hard monthly maximum: six consumed publication attempts in `Europe/Amsterdam`.
- Proposed slots: the 3rd, 8th, 13th, 18th, 23rd and 28th of each month at 10:00, with a 30-minute execution window.
- Maximum one consumed attempt per slot.
- `uncertain` and verification-failed attempts consume their slot and monthly quota until manually reconciled.
- No catch-up publication after a missed slot.
- A quality failure may produce one, or zero, articles in a month.
- The emergency kill switch defaults to active.

## Identity and permission boundaries

Research, content generation, Wix draft creation and future publication use separate identities. The future publication identity is bound to the DJ Elvio site and a single exact publish route. It receives no CRM, Google Ads, customer-communication, Global Groove, or general Wix access. The recurring research job never receives draft or publication credentials.

## Decision flow

Opportunity evidence and commercial relevance must be traceable. Existing-page optimization takes precedence where appropriate. A candidate fails closed on stale evidence, weak demand, duplication, cannibalization, unsupported facts, invalid links, incomplete metadata, image-rights failure, fingerprint drift, or a proposed commercial/price/package/tracking change.

Creative Studio remains the single asset registry. Only owned, licensed, or owner-approved assets with provenance, compatible formats, useful alt text and acceptable reuse history are eligible. Fabricated documentary event photography is rejected. Missing imagery holds the article unless a future versioned policy explicitly authorizes image-free publication for that category.

## Staged activation

1. Development and synthetic tests only.
2. Separately approved one-shot unpublished draft.
3. Separately approved single publication trial with public verification.
4. Separately approved one-slot autonomous trial.
5. Separately approved six-slot full autopilot.

## Content-distribution guidance

The opportunity queue may aim for two wedding topics, one corporate-event topic, one birthday/private-celebration topic, one pricing or event-planning topic and one seasonal or emerging topic. This is planning guidance only. Evidence strength and commercial relevance always outrank category balance, and unused category capacity never creates filler content.

## Estimated incremental monthly cost

These are planning estimates, not actual billing. Existing Wix and Google Cloud fixed costs are excluded.

- Low-cost scenario, limited revisions and extensive reuse of persisted evidence: approximately EUR 3-8.
- Typical scenario, six researched drafts with normal validation and occasional revision: approximately EUR 8-25.
- Higher-revision scenario, repeated research or editorial regeneration: approximately EUR 25-60.

AI inference is expected to dominate. Six scheduler invocations, bounded Cloud Run execution, Firestore reservation documents, Secret Manager access, Wix API calls, logs and dashboard reads should remain small at this frequency. No paid SEO, image or additional database service is required.

No stage authorizes the next stage implicitly.
