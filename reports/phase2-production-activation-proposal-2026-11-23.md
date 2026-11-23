# ELVIO SEO AI Phase 2 — Production Activation Proposal

Production remains unchanged. A future controlled activation should be split into independent approvals.

## Gate 1 — SEO derived memory

- Deploy the tested Phase 2 code to the existing `elvio-seo-ai` job.
- Add versioned derived collections for opportunities, briefs, technical findings, and review state.
- Preserve the current immutable evidence snapshots.
- Keep all Wix, CRM, Ads, and communication writers disabled.
- Run one owner-triggered validation and replay test.

## Gate 2 — Read-only attribution candidates

- Approve exact field mappings from Wix intake and CRM read models.
- Store only privacy-safe candidate records in the SEO namespace.
- Do not backfill unknown sources as organic.
- Compare counts against existing Analytics without changing CRM.

## Gate 3 — Review-interface integration

- Reuse the existing authenticated Analytics/Marketing interface.
- Add read-only opportunities, findings, briefs, and approval status.
- Do not create a second dashboard or control plane.
- Deploy through the normal preview and PR workflow.

## Gate 4 — Wix draft test

- Create a dedicated minimum-permission Wix credential separate from the scheduled research job.
- Approve one exact fingerprinted draft.
- Create and retrieve the draft, verify fields, and rehearse rollback.
- Publishing remains a separate approval.

## Gate 5 — Production instrumentation

- Approve any new Wix hidden fields, analytics events, or CRM linkage separately.
- Verify privacy/legal requirements, duplicate prevention, and rollback.
- Do not change existing historical attribution.

## Schedules

No new schedule is required initially. Phase 2 should reuse the existing weekly/monthly cadence only after Gate 1 approval. No live schedule was changed during development.

## Cost

Local development added no paid dependency. A low-frequency derived-memory workload should remain near the existing €0–€6/month envelope. AI generation and web research should use bounded budgets and explicit per-run limits; Wix API usage is expected to be negligible. Paid SEO subscriptions remain excluded.
