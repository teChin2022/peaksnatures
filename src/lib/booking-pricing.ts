import type { createServiceRoleClient } from "@/lib/supabase/server";
import { calculateTotalPrice } from "@/lib/calculate-price";
import {
  computeCompositionSurcharge,
  hasDefaultPriceTier,
  resolveGuestPricing,
  type TierPricingInput,
} from "@/lib/guest-pricing";
import type { RoomSeasonalPrice } from "@/types/database";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type SelectedOptionInput = {
  id: string;
  name: string;
  price: number;
  unit_price?: number;
  pricing_type?: "per_night" | "per_time";
};

/** One room line in a multi-room cart, as sent by the client. */
export interface LineItemInput {
  room_id: string;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  num_guests: number;
  guest_pricing_ids?: string[];
  selected_options?: SelectedOptionInput[];
}

/** A line whose price has been re-computed + validated against the DB. */
export interface VerifiedLineItem {
  room_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  num_guests: number;
  base_price: number;
  options_total: number;
  composition_surcharge: number;
  /** base + options + composition, BEFORE any cart-level discount. */
  gross: number;
  selected_options: SelectedOptionInput[];
  guest_pricing_label: string | null;
  guest_pricing_surcharge: number;
}

export type LineItemResult =
  | { ok: true; data: VerifiedLineItem }
  | { ok: false; error: string; status: number };

/**
 * Server-side price verification for a single room line — the per-room logic
 * that the single-room `POST /api/bookings` runs inline (route.ts), lifted here
 * so the multi-room group route can call it once per line and sum the results.
 *
 * Never trusts client prices: re-reads room base price, seasonal prices, option
 * prices (per_night × nights / per_time flat), and the room's guest-composition
 * tiers. Reading ALL the room's tiers (not just the chosen ones) is what lets the
 * server decide the mode itself — see `resolveGuestPricing` — so a client cannot
 * assert "stepper mode" on a room whose tiers say otherwise.
 */
export async function verifyRoomLineItem(
  supabase: ServiceClient,
  homestayId: string,
  item: LineItemInput,
  locale: string = "th",
): Promise<LineItemResult> {
  const selectedOptions = item.selected_options ?? [];
  const optionIds = selectedOptions.map((o) => o.id);

  const tierIds = item.guest_pricing_ids ?? [];

  const [{ data: roomRow, error: roomError }, { data: seasonRows }, { data: dbOptions }, { data: tierRows }] =
    await Promise.all([
      supabase.from("rooms").select("price_per_night, homestay_id").eq("id", item.room_id).single(),
      supabase.from("room_seasonal_prices").select("*").eq("room_id", item.room_id),
      optionIds.length > 0
        ? supabase.from("room_options").select("id, price, pricing_type").eq("room_id", item.room_id).in("id", optionIds)
        : Promise.resolve({ data: null }),
      supabase
        .from("room_guest_pricing")
        .select("id, adults, children, detail, surcharge, sort_order")
        .eq("room_id", item.room_id)
        .eq("is_active", true),
    ]);

  if (roomError || !roomRow) {
    return { ok: false, error: "Room not found", status: 404 };
  }
  const room = roomRow as unknown as { price_per_night: number; homestay_id: string };
  if (room.homestay_id !== homestayId) {
    return { ok: false, error: "Room does not belong to this homestay", status: 400 };
  }

  const checkIn = new Date(item.check_in);
  const checkOut = new Date(item.check_out);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  if (nights <= 0) {
    return { ok: false, error: "Invalid date range", status: 400 };
  }

  const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];
  const { total: basePrice } = calculateTotalPrice(room.price_per_night, checkIn, checkOut, seasons);

  // Options: per_night charges price × nights; per_time charges a flat fee. DB is authoritative.
  let optionsTotal = 0;
  const normalizedOptions: SelectedOptionInput[] = [];
  if (optionIds.length > 0) {
    const dbMap = new Map(
      ((dbOptions as { id: string; price: number; pricing_type: "per_night" | "per_time" }[]) || []).map((o) => [
        o.id,
        { price: o.price, pricing_type: o.pricing_type },
      ]),
    );
    for (const opt of selectedOptions) {
      const row = dbMap.get(opt.id);
      if (row !== undefined) {
        const enforced = row.pricing_type === "per_time" ? row.price : row.price * nights;
        optionsTotal += enforced;
        normalizedOptions.push({
          id: opt.id,
          name: opt.name,
          price: enforced,
          unit_price: row.price,
          pricing_type: row.pricing_type,
        });
      }
    }
  }

  // Guest-composition surcharge, charged per night. The room's own tiers decide whether
  // the chosen tier replaces the headcount or merely adds extra guests to the stepper.
  const roomTiers = (tierRows as unknown as TierPricingInput[]) || [];
  if (tierIds.some((id) => !roomTiers.some((t) => t.id === id))) {
    return { ok: false, error: "Invalid guest pricing selection", status: 400 };
  }
  // A base-tier list is a set of alternatives, so stacking two of them is incoherent.
  if (tierIds.length > 1 && hasDefaultPriceTier(roomTiers)) {
    return { ok: false, error: "Invalid guest pricing selection", status: 400 };
  }

  const guests = resolveGuestPricing(roomTiers, tierIds, item.num_guests, locale);
  const compositionSurcharge = computeCompositionSurcharge(guests.surchargePerNight, nights);
  const guestPricingSurcharge = guests.surchargePerNight;
  const guestPricingLabel = guests.label;
  const numGuests = guests.numGuests;

  const gross = basePrice + optionsTotal + compositionSurcharge;

  return {
    ok: true,
    data: {
      room_id: item.room_id,
      check_in: item.check_in,
      check_out: item.check_out,
      nights,
      num_guests: numGuests,
      base_price: basePrice,
      options_total: optionsTotal,
      composition_surcharge: compositionSurcharge,
      gross,
      selected_options: normalizedOptions,
      guest_pricing_label: guestPricingLabel,
      guest_pricing_surcharge: guestPricingSurcharge,
    },
  };
}

/**
 * The room's own rate for a stay: the seasonal price for every night a season
 * covers, the room's base price for the rest. No options, no guest-composition
 * surcharge — just what the room is configured to cost.
 *
 * Used as the commission base for quick bookings, whose `total_price` is a
 * host-entered figure (what they charged via an OTA or at the door) and may be
 * 0. Returns null if the room no longer exists or the date range is invalid.
 */
export async function computeRoomRateTotal(
  supabase: ServiceClient,
  roomId: string,
  checkIn: string,
  checkOut: string,
): Promise<number | null> {
  const [{ data: roomRow }, { data: seasonRows }] = await Promise.all([
    supabase.from("rooms").select("price_per_night").eq("id", roomId).single(),
    supabase.from("room_seasonal_prices").select("*").eq("room_id", roomId),
  ]);

  const room = roomRow as unknown as { price_per_night: number } | null;
  if (!room) return null;

  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (!(end > start)) return null;

  const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];
  const { total } = calculateTotalPrice(room.price_per_night, start, end, seasons);
  return total;
}

/**
 * Split an integer `total` across `weights` proportionally, using largest-remainder
 * rounding so the parts sum back to `total` EXACTLY (keeps GMV/commission exact when
 * splitting a cart discount or payment across its member rooms). The rounding
 * remainder goes to the largest fractional parts (ties → earlier index). When all
 * weights are 0, splits as evenly as possible.
 */
export function splitProportional(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total === 0) return weights.map(() => 0);

  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const base = Math.floor(total / n);
    const parts = weights.map(() => base);
    let rem = total - base * n;
    for (let i = 0; i < n && rem > 0; i++, rem--) parts[i] += 1;
    return parts;
  }

  const exact = weights.map((w) => (total * w) / sumW);
  const parts = exact.map((x) => Math.floor(x));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    parts[order[k].i] += 1;
  }
  return parts;
}
