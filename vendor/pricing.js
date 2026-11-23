function clean(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(",", ".")
    .replace(/\s+/g, "")
    .replace(/–/g, "-")
    .trim();
}

function normalizedEventType(value) {
  return clean(value).replace(/[^a-z]/g, "");
}

function guestBand(value) {
  const guests = clean(value);
  if (!guests) return null;
  const numericGuests = guests.match(/^\d+$/);
  if (numericGuests) {
    const count = Number.parseInt(numericGuests[0], 10);
    if (count <= 50) return "to50";
    if (count <= 100) return "to100";
    if (count <= 200) return "to200";
    return "200+";
  }
  if (guests.includes("upto50") || guests.includes("tot50")) return "to50";
  if (guests.includes("upto100") || guests.includes("tot100")) return "to100";
  if (guests.includes("upto200") || guests.includes("tot200")) return "to200";
  return "200+";
}

function durationHours(input) {
  const duration = Object.values(input ?? {}).find((value) => (
    typeof value === "string" && /(?:hour|uur)/i.test(value)
  )) ?? "";
  const match = clean(duration).match(/(\d+)/);
  return {
    rawDurationDetected: duration,
    duration: clean(duration),
    hours: match ? Number.parseInt(match[1], 10) : 4,
  };
}

function priceByGuests(band, extraSmall, small, medium, large) {
  if (band === "to50") return extraSmall;
  if (band === "to100") return small;
  if (band === "to200") return medium;
  return large;
}

export function calculatePrivateEventPrice(input = {}) {
  const eventType = String(input.eventType ?? "").trim();
  const event = normalizedEventType(eventType);
  if (event === "companyevent" || event === "bedrijfsfeest") return { skip: true };

  const guests = guestBand(input.gasten ?? input.guests);
  if (!guests) return { status: "needs_information", missing: ["guests"] };
  const detectedDuration = durationHours(input);
  const wedding = event === "wedding" || event === "bruiloftsfeest";
  const birthday = ["birthday", "birthdayparty", "verjaardag", "verjaardagsfeest"].includes(event);
  if (birthday) {
    const fullDriveInBasePrice = guests === "to50" ? 300 : 450;
    const surcharge = detectedDuration.hours >= 6 ? 100 : detectedDuration.hours === 5 ? 50 : 0;
    const finalPrice = fullDriveInBasePrice + surcharge;
    return {
      eventType,
      guests,
      equipment: "Full Drive-in",
      ...detectedDuration,
      fullDriveInBasePrice,
      surcharge,
      finalPrice,
      finalPriceFormatted: `€${Number(finalPrice).toLocaleString("nl-NL")},-`,
      finalPriceCents: String(Math.round(finalPrice * 100)),
      ruleVersion: "birthday-2026-11-16-guest-and-duration-tiers",
    };
  }
  const fullDriveInBasePrice = wedding
    ? priceByGuests(guests, 500, 650, 775, 850)
    : priceByGuests(guests, 300, 450, 550, 600);
  const surcharge = detectedDuration.hours >= 6 ? 200 : detectedDuration.hours === 5 ? 100 : 0;
  const minimumPrice = guests === "to50" ? 300 : 450;
  const finalPrice = Math.round(Math.max(minimumPrice, fullDriveInBasePrice + surcharge) / 5) * 5;

  return {
    eventType,
    guests,
    equipment: "Full Drive-in",
    ...detectedDuration,
    fullDriveInBasePrice,
    surcharge,
    finalPrice,
    finalPriceFormatted: `€${Number(finalPrice).toLocaleString("nl-NL")},-`,
    finalPriceCents: String(Math.round(finalPrice * 100)),
    ruleVersion: wedding ? "wedding-2026-11-16-guest-tier" : "private-2026-11-16-guest-tier",
  };
}

export function calculateCorporateEventPrice(input = {}) {
  const eventType = String(input.eventType ?? "Company Event").trim();
  const guests = guestBand(input.gasten ?? input.guests);
  if (!guests) return { status: "needs_information", missing: ["guests"] };
  const detectedDuration = durationHours(input);
  const fullDriveInBasePrice = priceByGuests(guests, 650, 750, 800, 850);
  const surcharge = detectedDuration.hours >= 6 ? 150 : detectedDuration.hours === 5 ? 100 : 0;
  const finalPrice = Math.round((fullDriveInBasePrice + surcharge) / 5) * 5;

  return {
    eventType,
    guests,
    equipment: "Full Drive-in",
    ...detectedDuration,
    fullDriveInBasePrice,
    surcharge,
    finalPrice,
    finalPriceFormatted: `€${Number(finalPrice).toLocaleString("nl-NL")},-`,
    finalPriceCents: String(Math.round(finalPrice * 100)),
    ruleVersion: "corporate-2026-11-23-guest-tier",
  };
}
