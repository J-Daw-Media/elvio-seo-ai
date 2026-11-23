export const blogAutopilotPolicyV1 = Object.freeze({
  id: "elvio-blog-autopilot-v1",
  mode: "full_autopilot",
  activationState: "development_only",
  timezone: "Europe/Amsterdam",
  monthlyPublicationLimit: 2,
  slots: Object.freeze([
    { id: "second-wednesday", weekday: 3, ordinal: 2, hour: 10, minute: 0 },
    { id: "fourth-wednesday", weekday: 3, ordinal: 4, hour: 10, minute: 0 },
  ]),
  slotWindowMinutes: 30,
  maximumPerSlot: 1,
  catchUpPublishingAllowed: false,
  imageRequiredByDefault: true,
  imageFreeCategories: Object.freeze([]),
  emergencyKillSwitchRequired: true,
  ownerNotificationOnHoldOrSkip: true,
});

export function amsterdamParts(instant) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("AUTOPILOT_TIME_INVALID");
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: blogAutopilotPolicyV1.timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday: weekdays[get("weekday")], hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function publicationSlotAt(instant, policy = blogAutopilotPolicyV1) {
  const local = amsterdamParts(instant);
  const ordinal = Math.floor((local.day - 1) / 7) + 1;
  const slot = policy.slots.find((item) => item.weekday === local.weekday && item.ordinal === ordinal && item.hour === local.hour && local.minute >= item.minute && local.minute < item.minute + policy.slotWindowMinutes);
  return slot ? { ...slot, key: `${local.year}-${String(local.month).padStart(2, "0")}:${slot.id}`, monthKey: `${local.year}-${String(local.month).padStart(2, "0")}`, local } : null;
}

export function evaluatePublicationWindow({ instant, policy = blogAutopilotPolicyV1, killSwitch = true, monthlyRecords = [], slotRecords = [] } = {}) {
  if (killSwitch) return { allowed: false, reason: "kill_switch_active", slot: null };
  const slot = publicationSlotAt(instant, policy);
  if (!slot) return { allowed: false, reason: "outside_authorized_slot", slot: null };
  const consumedStates = new Set(["publication_reserved", "publication_started", "published_verified", "uncertain", "publication_verification_failed"]);
  const monthCount = monthlyRecords.filter((item) => item.monthKey === slot.monthKey && consumedStates.has(item.state)).length;
  if (monthCount >= policy.monthlyPublicationLimit) return { allowed: false, reason: "monthly_limit_reached", slot, monthCount };
  if (slotRecords.some((item) => item.slotKey === slot.key && consumedStates.has(item.state))) return { allowed: false, reason: "slot_already_consumed", slot, monthCount };
  return { allowed: true, reason: "slot_available", slot, monthCount };
}

