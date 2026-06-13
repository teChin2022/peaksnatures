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
 */
export function composeTierLabel(tier: TierLabelInput, locale: string = "th"): string {
  const isEn = locale.startsWith("en");
  const w = isEn ? WORDS.en : WORDS.th;
  const detail = tier.detail?.trim();

  let label: string;
  if (isEn) {
    const parts = [`${tier.adults} ${w.adults}`];
    if (tier.children > 0) parts.push(`${tier.children} ${w.children}`);
    label = parts.join(", ");
    if (detail) label += ` · ${detail}`;
  } else {
    label = `${w.adults} ${tier.adults}`;
    if (tier.children > 0) label += ` ${w.children} ${tier.children}`;
    if (detail) label += ` ${detail}`;
  }
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
