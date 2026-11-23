# ELVIO SEO AI Phase 2 — Organic Attribution Contract

## Existing field map

| Lifecycle point | Existing evidence |
|---|---|
| Wix submission | `submissionId`, V2 `_id`, `formId`, `formName`, `receivedAt` |
| Acquisition | `landingPageUrl`, `referrer`, UTM fields, `gclid`, `wbraid`, `gbraid` |
| CRM | stable lead/event `id`, contact identity where available, status/segment, event category, price |
| Quotation | `quotationReference`, `leadId` |
| Booking | `bookingId`, explicit confirmed state |
| Revenue | confirmed price/payment/invoice reference where present |

## Implemented contract

- Stable attribution identity is derived from the original Wix submission ID.
- Original identifiers remain unchanged and are stored as references.
- Acquisition evidence is classified `observed`, `verified`, `inferred`, or `unavailable`.
- Unknown source remains unknown. A landing page alone does not prove organic acquisition.
- Organic requires explicit source/medium evidence or a recognized search-engine referrer.
- Paid click identifiers remain separate from organic evidence.
- Search Console queries are aggregate evidence and are never assigned to a person.
- Returning customers keep separate inquiry and booking events.
- Lifecycle records are appended using deterministic IDs; duplicate events collapse.
- Conflicting source evidence creates a manual-review conflict, never an overwrite.
- Revenue requires an explicit confirmed amount and external reference.
- Analytics identifiers are hashed before entering the attribution candidate.
- Reconciliation is read-only and reports `writesPerformed: 0`.

## Metrics contract

The aggregate output supports inquiries, qualified inquiries, confirmed bookings, verified attributable revenue, inquiry-to-booking rate, and unknown-source inquiries. Revenue by landing page or event category is valid only when the underlying candidate has verified source and booking evidence.

## Production gate

No production event capture, tracking change, CRM writer, or historical backfill was enabled. Activation requires a separately approved field-level integration and rollback plan.
