# ELVIO SEO AI — Phase 2 Gate 2 Production Attribution Activation Report

Date: 23 November 2026 (Europe/Amsterdam)

## 1. Executive decision

**GO — Gate 2 technical activation is complete.**

The bounded, read-only attribution process is deployed and its first owner-triggered reconciliation is complete. It created 23 privacy-safe, immutable SEO attribution candidates and one execution ledger record. Replay created zero duplicates. No Wix, CRM, quotation, booking, invoice, payment, Google Ads, schedule, or customer-communication record was modified.

Commercial result: production currently supports **zero verified organic-attributed inquiries, bookings, booking value, or collected revenue**. All 23 eligible acquisition records remain unknown because qualifying organic evidence is absent. This is a measurement limitation, not a deployment failure.

## 2. Gate-numbering reconciliation

The authoritative roadmap is the original five-gate proposal:

1. SEO derived memory
2. Read-only attribution candidates
3. Review-interface integration
4. Wix draft test
5. Production instrumentation

The Gate 1 report incorrectly relabelled the remaining gates. This Gate 2 authorization was interpreted only as read-only attribution-candidate activation. No review-interface, Wix draft, publication, tracking, CRM-write, or advertising permission was inferred.

## 3. Source and deployment evidence

This local project mirror has no usable Git `HEAD`; therefore no Git commit can be honestly reported. Reproducibility is established through the exact Cloud Build and immutable image digest.

- Project: `crm2026-497707`
- Region: `europe-west4`
- Job: `elvio-seo-ai`
- Build ID: `f20c205c-4c54-4b5b-b647-3016ef38a2eb`
- Previous Gate 1 image: `sha256:2305649ca91188d3787ee65e3dcaba8c97505e01f31d588c5859717c5de4a952`
- Gate 2 image: `sha256:cdf3b27ae3d47387dbdf40169e54cf403cb3a6fa0cafb4f43e2e6301b6bd76c6`
- Build package: 30 files, 79,196 bytes
- Production dry-run execution: `elvio-seo-ai-6lv2h`
- Controlled persistence execution: `elvio-seo-ai-5lptn`
- Warning/error logs across both executions: 0

## 4. Read-access and permission verification

The runtime identity remains:

`elvio-seo-ai@crm2026-497707.iam.gserviceaccount.com`

Existing roles:

- `roles/datastore.user`
- `roles/logging.logWriter`
- `roles/monitoring.metricWriter`

No permission was added or changed. Firestore IAM does not provide practical per-collection separation for this existing service-account pattern: `datastore.user` is broader than an ideal read-only business-data role because the same job must create SEO-only records. Risk is constrained in code by a dedicated read-only client exposing only `list`, a hard six-collection allowlist, and a separate SEO store that prefixes all writes with `elvio_seo_ai_`. No business-data writer is called by the Gate 2 path.

Approved read collections:

- `leadAttribution`
- `wixOfferDeliveries`
- `quotationReferences`
- `automatedBookingConfirmations`
- `bookingAcquisitionLinks`
- `attributedBookingRevenue`

Every other collection is rejected by the reader.

## 5. Exact field mappings

| Purpose | Verified production source and fields | Gate 2 use |
|---|---|---|
| Inquiry identity | `leadAttribution.submissionId`, `acquisitionId` | Deterministic candidate identity; distinct inquiries remain distinct |
| Acquisition | `landingPageUrl`, `referrer`, `utm`, `clickIds`, `hasGoogleClickId`, `acquisitionSource`, timestamps | Classification only; URL query removed; click IDs hashed |
| Wix delivery | `wixOfferDeliveries.submissionId`, `acquisitionId`, `status`, `quotationReference`, `sentAt` | Verifies quotation lifecycle without copying recipient data |
| Quotation | `quotationReferences.submissionId`, `acquisitionId`, `quotationReference`, `leadId`, `createdAt`, `amount` | Stable reference and quotation existence; amount is not revenue |
| Booking | `automatedBookingConfirmations.booking`, status; `bookingAcquisitionLinks` where available | Only explicit, non-synthetic confirmed evidence may count |
| Booking value/revenue | `attributedBookingRevenue.acquisitionId`, `agreementNumber`, `fullAgreedValue`, `paymentStatus`, `confirmedAt` | Confirmed booking link; collected revenue remains zero unless explicit payment evidence supports it |

Missing fields remain missing. Names, email addresses, telephone numbers, message bodies, and customer text are not copied into SEO memory.

## 6. Production source baseline

Before and after activation:

| Collection | Count |
|---|---:|
| `leadAttribution` | 24 |
| `wixOfferDeliveries` | 85 |
| `quotationReferences` | 21 |
| `automatedBookingConfirmations` | 2 |
| `bookingAcquisitionLinks` | 0 |
| `attributedBookingRevenue` | 0 |

Of 24 acquisition records, one is explicitly synthetic/excluded, leaving 23 eligible for the bounded run. All 23 have stable submission IDs; 23 match a Wix delivery; 19 match exactly one quotation; no real confirmed-booking or verified-revenue receipt exists. The two booking-confirmation records are archived synthetic/internal-test records and were excluded.

## 7. Dry-run result

Execution `elvio-seo-ai-6lv2h` used the deployed Gate 2 image with a one-time `SEO_ATTRIBUTION_MODE=dry_run` execution override.

- Candidates: 23
- Conflicts: 0
- Unknown sources: 23
- Verified organic inquiries: 0
- Confirmed organic bookings: 0
- Booking value: EUR 0 verified
- Collected revenue: EUR 0 verified
- PII leakage detected: 0
- Persistent writes: 0
- Source-system writes: 0
- Source fingerprint: `3d1ac0abbc305796ffb3eb9c44df384c1f59943e1da24dd89b93b176ae527b0d`

An initial local dry run found and corrected a duplicate grouping issue when `submissionId` and `acquisitionId` carried the same value. That run made zero writes. A regression test now protects this case.

## 8. Controlled production persistence

Execution `elvio-seo-ai-5lptn` used a one-time `SEO_ATTRIBUTION_MODE=persist` execution override.

- `elvio_seo_ai_attribution_candidates_v1`: 23 created
- `elvio_seo_ai_attribution_conflicts_v1`: 0 created
- `elvio_seo_ai_attribution_executions_v1`: 1 created
- Total Gate 2 writes: 24
- Source-system writes: 0

The production job configuration does **not** contain `SEO_ATTRIBUTION_MODE`. Scheduled weekly/monthly runs therefore keep attribution disabled.

## 9. Candidate classification and commercial metrics

Measurement population: 23 non-synthetic acquisition records in the bounded production read set.

| Metric | Result | Denominator/evidence |
|---|---:|---|
| Inquiries evaluated | 23 | Eligible acquisition records |
| Organic-attributed inquiries | 0 | 23 evaluated |
| Qualified organic inquiries | 0 | No verified organic inquiries |
| Confirmed organic bookings | 0 | No explicit organic booking link |
| Verified attributable booking value | EUR 0 | No `attributedBookingRevenue` records |
| Verified collected revenue | EUR 0 | No explicit collected-payment evidence |
| Inquiry-to-booking conversion | Not calculable | Organic denominator is zero |
| Unknown-source inquiries | 23 | 23 evaluated |
| Conflicting candidates | 0 | Deterministic reconciliation |
| Missing booking lifecycle links | 23 | 23 evaluated |

Landing-page and event-category commercial breakdowns are not reported because no verified organic inquiry exists.

## 10. Replay and identity verification

The controlled persistence execution immediately replayed the identical prepared input:

- Candidate duplicates recognized: 23
- New candidate records on replay: 0
- New execution records on replay: 0
- Identity collisions: 0
- Unexpected writes: 0
- Result: `replaySafe: true`

All 23 live candidate records have 23 unique document IDs. Changed evidence will create a new immutable version rather than overwrite the prior candidate.

## 11. Privacy and safety verification

- Raw Google click identifiers are never stored; only SHA-256 hashes are retained.
- Landing-page query strings are removed.
- Aggregate Search Console queries are never attached to individuals.
- No candidate payload contains recipient, client name, email, phone, message, or message-body fields.
- Unknown acquisition remains unknown.
- Paid evidence takes precedence over organic-looking evidence; paid/organic conflicts require review.
- Quotations are not treated as collected revenue.
- Distinct inquiries are keyed by stable submission identity, not email.
- Candidate persistence is create-only and SEO-namespaced.
- Wix, CRM, booking, quotation, payment, invoice, Ads, and communication writers remain unreachable from the Gate 2 workflow.

## 12. Regression result

Post-deployment repository regression:

- Tests: 1,972
- Passed: 1,970
- Failed: 0
- Skipped: 2 unchanged intentional skips
- Gate 2 focused tests: 24/24 passed

Coverage includes unknown preservation, paid/organic conflicts, stable identity, repeat-inquiry separation, lifecycle evidence, privacy, read allowlisting, bounded counts, create-only versioning, replay, Wix prohibition, CRM prohibition, and existing Gate 1 behavior.

## 13. Phase 1B and Gate 1 preservation

Gate 1 live records remain unchanged:

- Opportunities: 7
- Briefs: 7
- Technical findings: 9
- Pending owner reviews: 7
- Derived executions: 1

The four immutable Phase 1B snapshots remain unchanged at 770,201 total bytes. Both Gate 2 executions reused the existing snapshot and created no new snapshot.

## 14. Schedule preservation

No schedule was created or modified:

- Weekly: Monday 08:00 Europe/Amsterdam, enabled
- Monthly: Monday 09:00 Europe/Amsterdam, enabled, existing first-Monday guard

Attribution is disabled for scheduled executions. Recurring reconciliation requires separate approval.

## 15. Cost observation

Incremental Gate 2 cost is estimated below EUR 0.01: two short Cloud Run executions, bounded Firestore reads, 24 create operations, and no additional object storage. Billing export remains authoritative.

## 16. Rollback status

Rollback is ready but was not required. To restore Gate 1:

1. Point the job to `sha256:2305649ca91188d3787ee65e3dcaba8c97505e01f31d588c5859717c5de4a952`.
2. Do not delete Gate 2 audit records; the Gate 1 image does not read them.
3. Confirm attribution mode remains absent from saved environment variables.
4. Run one controlled Gate 1 validation and verify schedules, snapshots, collectors, and logs.

## 17. Remaining measurement gaps

- All eligible acquisition records are currently source `unknown`.
- Only three records contain any landing/UTM evidence, but none qualifies as verified organic under the conservative contract.
- No real booking-acquisition link exists.
- No attributed booking revenue receipt exists.
- Quotation amounts cannot be treated as revenue.
- Collected-payment attribution cannot be calculated from the currently linked evidence.
- Firestore IAM remains database-wide for the existing runtime identity; collection isolation is enforced in application code and namespace design.

These gaps must not be repaired by guessing or historical overwrites.

## 18. Recommended next action

Stop for owner review. Do not proceed to Gate 3 automatically.

If the owner later approves Gate 3, integrate these read-only aggregate results into the existing authenticated review interface. Production instrumentation remains Gate 5 and requires a separate approval because future organic attribution quality depends on reliably capturing source/medium and stable inquiry-to-booking links at collection time.

Gates 3–5 remain disabled. No Wix draft, publication, tracking, CRM write, advertising mutation, or customer communication was performed.
