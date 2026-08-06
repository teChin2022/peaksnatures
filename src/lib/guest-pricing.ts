import type { RoomGuestPricing } from "@/types/database";

/** The fields needed to render/snapshot a guest-composition tier. */
export type TierLabelInput = Pick<RoomGuestPricing, "adults" | "children" | "detail">;

const WORDS = {
  th: { adults: "ผู้ใหญ่", children: "เด็ก" },
  en: { adults: "Adults", children: "Children" },
} as const;

/**
 * Compose the human-readable label for a guest-composition pricing tier.
 *
 *   th -> "ผู้ใหญ่ 2 เด็ก 1 อายุ 0-5 ปี"
 *   en -> "2 Adults, 1 Children · อายุ 0-5 ปี"
 *
 * `detail` is free text supplied by the host (age range / extra-guest note).
 * Self-contained (no translator) so the booking page, the booking API
 * snapshot, and notifications all produce an identical string.
 *
 * A zero adults count is dropped when there are children, so a children-only
 * extra-guest row reads "เด็ก 1" rather than "ผู้ใหญ่ 0 เด็ก 1". It is still shown
 * when children is 0 too, so an all-zero tier never collapses to an empty label.
 */
export function composeTierLabel(tier: TierLabelInput, locale: string = "th"): string {
  const isEn = locale.startsWith("en");
  const w = isEn ? WORDS.en : WORDS.th;
  const detail = tier.detail?.trim();
  const showAdults = tier.adults > 0 || tier.children === 0;

  const parts: string[] = [];
  if (isEn) {
    if (showAdults) parts.push(`${tier.adults} ${w.adults}`);
    if (tier.children > 0) parts.push(`${tier.children} ${w.children}`);
    let label = parts.join(", ");
    if (detail) label += ` · ${detail}`;
    return label;
  }
  if (showAdults) parts.push(`${w.adults} ${tier.adults}`);
  if (tier.children > 0) parts.push(`${w.children} ${tier.children}`);
  let label = parts.join(" ");
  if (detail) label += ` ${detail}`;
  return label;
}

/**
 * Total surcharge for a stay. The composition surcharge is charged PER NIGHT,
 * like a `per_night` room option, so it scales with the number of nights.
 */
export function computeCompositionSurcharge(surcharge: number, nights: number): number {
  if (!surcharge || nights <= 0) return 0;
  return surcharge * nights;
}

/** The fields `resolveGuestPricing` needs from a tier row. */
export type TierPricingInput = TierLabelInput & Pick<RoomGuestPricing, "id" | "surcharge" | "sort_order">;

/**
 * True when the host defined a "ใช้ราคาปกติ" row — the baseline composition that
 * charges the room's normal rate, stored as `surcharge === 0`. Its presence is what
 * makes the tier list a COMPLETE set of alternatives, so the list can stand in for
 * the guest picker. Without it every row costs extra, the list is only a set of
 * optional add-ons, and the +/- stepper has to supply the base headcount.
 */
export function hasDefaultPriceTier(tiers: Pick<RoomGuestPricing, "surcharge">[]): boolean {
  return tiers.some((t) => t.surcharge === 0);
}

export interface GuestPricingResolution {
  numGuests: number;
  /** Per-night total → `bookings.guest_pricing_surcharge` (rescales on date change). */
  surchargePerNight: number;
  /** Joined snapshot → `bookings.guest_pricing_label`; null when nothing is selected. */
  label: string | null;
}

/**
 * Single source of truth for a room line's headcount, per-night surcharge and label —
 * shared by the booking dialog, the cart and both booking API routes so all four agree.
 *
 * Two modes, decided by the room's own tiers (never by the client):
 *   - base-tier mode: one tier is picked and IS the headcount, as it has always been.
 *   - stepper mode:   the stepper is the base party and ticked tiers add extra guests
 *                     on top, their surcharges stacking.
 *
 * @param roomTiers     every ACTIVE tier of the room
 * @param selectedIds   chosen tier ids (at most one in base-tier mode)
 * @param stepperGuests the +/- value; ignored in base-tier mode
 */
export function resolveGuestPricing(
  roomTiers: TierPricingInput[],
  selectedIds: string[],
  stepperGuests: number,
  locale: string = "th",
): GuestPricingResolution {
  const selected = roomTiers
    .filter((t) => selectedIds.includes(t.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  const surchargePerNight = selected.reduce((sum, t) => sum + (t.surcharge || 0), 0);
  // " + " rather than ", ": composeTierLabel already uses a comma internally in EN.
  const label = selected.length > 0 ? selected.map((t) => composeTierLabel(t, locale)).join(" + ") : null;

  const numGuests = hasDefaultPriceTier(roomTiers)
    ? (selected[0] ? selected[0].adults + selected[0].children : stepperGuests)
    : selected.reduce((sum, t) => sum + t.adults + t.children, stepperGuests);

  return { numGuests, surchargePerNight, label };
}

/**
 * One-line guest summary for a cart line. In base-tier mode the tier label says it all;
 * in stepper mode the headcount leads and any ticked extras follow.
 *
 *   base-tier -> "ผู้ใหญ่ 2 เด็ก 1"
 *   stepper   -> "4 ท่าน · เด็กเพิ่ม 1 + ผู้ใหญ่เพิ่ม 1"
 *
 * `guestsWord` is passed in so this stays translator-free like `composeTierLabel`.
 * `numGuests` is the line's already-resolved headcount.
 */
export function composeLineGuestLabel(
  roomTiers: TierPricingInput[],
  selectedIds: string[],
  numGuests: number,
  guestsWord: string,
  locale: string = "th",
): string {
  const { label } = resolveGuestPricing(roomTiers, selectedIds, numGuests, locale);
  if (hasDefaultPriceTier(roomTiers) && label) return label;
  const head = `${numGuests} ${guestsWord}`;
  return label ? `${head} · ${label}` : head;
}
