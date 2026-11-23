import { runSeoIntelligence } from "./engine.js";
import { safetyState } from "./safety.js";
import { verifiedPricingContext } from "./pricingContext.js";

const result = await runSeoIntelligence({ state: safetyState(), collectors: [] });
console.log(JSON.stringify({ ...result, pricing: verifiedPricingContext(), note: "No external API credentials were used." }, null, 2));
