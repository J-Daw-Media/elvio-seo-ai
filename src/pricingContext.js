import { calculateCorporateEventPrice, calculatePrivateEventPrice } from "../vendor/pricing.js";

export function verifiedPricingContext() {
  const context = {
    birthday_private: {
      upTo50: calculatePrivateEventPrice({ eventType: "Private Event", guests: 50, duration: "4 hours" }).finalPrice,
      from51To100: calculatePrivateEventPrice({ eventType: "Private Event", guests: 51, duration: "4 hours" }).finalPrice,
    },
    wedding: {
      upTo50: calculatePrivateEventPrice({ eventType: "Wedding", guests: 50, duration: "4 hours" }).finalPrice,
      from51To100: calculatePrivateEventPrice({ eventType: "Wedding", guests: 51, duration: "4 hours" }).finalPrice,
    },
    corporate: {
      upTo50: calculateCorporateEventPrice({ eventType: "Company Event", guests: 50, duration: "4 hours" }).finalPrice,
      from51To100: calculateCorporateEventPrice({ eventType: "Company Event", guests: 51, duration: "4 hours" }).finalPrice,
    },
  };
  return { source: "vendor/pricing.js", verifiedAtRuntime: true, context };
}

export function compareRequestedPricing(requested) {
  const authoritative = verifiedPricingContext();
  const conflicts = [];
  for (const [category, bands] of Object.entries(requested || {})) {
    for (const [band, value] of Object.entries(bands || {})) {
      const actual = authoritative.context?.[category]?.[band];
      if (actual != null && Number(value) !== Number(actual)) conflicts.push({ category, band, requested: Number(value), authoritative: Number(actual) });
    }
  }
  return { authoritative, conflicts, safeForGeneratedPriceClaims: conflicts.length === 0 };
}
