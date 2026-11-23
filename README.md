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
