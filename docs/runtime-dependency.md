# Runtime dependency provenance

The verified Gate 2 Cloud Build context contained the ELVIO SEO AI package plus the shared pricing module from the parent application workspace:

`src/pricing.js`

An exact reviewed copy is retained in this repository as:

`vendor/pricing.js`

The deployed Gate 2 image copied that file to `/app/src/pricing.js`. Its runtime import path is used by `src/pricingContext.js`.

The vendor copy is provenance evidence and a reproducibility input. Production deployment configuration has not been changed by this source-governance recovery. Any future build-layout change must be separately reviewed and tested.

