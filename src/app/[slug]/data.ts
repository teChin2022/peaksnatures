import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isHostBlocked } from "@/lib/plan-expiry";
import { hasPastDueInvoice } from "@/lib/billing";
import { evaluatePromoCode } from "@/lib/promo-codes";
import { localizeHomestay } from "@/lib/translation/translate-homestay";
import { richTextToPlainText, sanitizeRichText } from "@/lib/sanitize";
import type { SupportedLocale } from "@/lib/translation/types";
import type { Homestay, Room, BlockedDate, Host, Review, RoomSeasonalPrice, RoomSpecialPrice, RoomOption, RoomGuestPricing, PromoCode } from "@/types/database";
import { SITE_NAME, buildAlternates } from "@/lib/seo";
import { resolveIconKeys } from "@/lib/list-icons";

/*
 * Data for the public homestay pages: the landing (/[slug]) and the booking
 * page (/[slug]/book). Server only: it reads with the service-role client, so
 * never import it from a "use client" file.
 */

export type InitialPromoInfo = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  recommender_name: string | null;
};

export const getPromoLinkInfo = cache(async function getPromoLinkInfo(
  homestayId: string,
  rawCode: string,
): Promise<InitialPromoInfo | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const supabase = createServiceRoleClient();
  const { data: row } = await supabase
    .from("promo_codes")
    .select(
      "id, code, discount_type, discount_value, recommender_name, start_at, expires_at, max_uses, times_used, is_active",
    )
    .eq("homestay_id", homestayId)
    .ilike("code", code)
    .maybeSingle();

  if (!row) return null;

  const promo = row as unknown as PromoCode;
  const verdict = evaluatePromoCode(promo);
  if (!verdict.ok) return null;

  return {
    id: promo.id,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: Number(promo.discount_value || 0),
    recommender_name: promo.recommender_name,
  };
});

export async function readLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  return cookieStore.get("locale")?.value === "en" ? "en" : "th";
}

export const getHomestayData = cache(async function getHomestayData(
  slug: string,
  locale: SupportedLocale,
) {
  const supabase = createServiceRoleClient();

  const { data: homestayRow } = await supabase
    .from("homestays")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!homestayRow) return null;

  const homestay = homestayRow as unknown as Homestay;

  // Parallel fetch: all queries below are independent of each other
  // B4+B5: rooms joined with seasonal_prices (eliminates sequential fetch),
  // review count merged into ratings query (3 review queries → 2)
  const GRID_REVIEWS = 6;
  const [
    { data: hostRow },
    { data: roomRows },
    { data: blockedRows },
    { data: bookingRows },
    { data: allRatings, count: reviewCount },
    { data: reviewRows },
    { count: totalBookingsCount },
    { data: lastBookingRow },
    { data: confirmedBookingRows },
  ] = await Promise.all([
    supabase.from("hosts").select("*").eq("id", homestay.host_id).single(),
    supabase.from("rooms").select("*, room_seasonal_prices(*), room_special_prices(*), room_options(*), room_guest_pricing(*)").eq("homestay_id", homestay.id).order("created_at", { ascending: true }),
    supabase.from("blocked_dates").select("*").eq("homestay_id", homestay.id),
    supabase.from("bookings").select("room_id, check_in, check_out").eq("homestay_id", homestay.id).in("status", ["pending", "confirmed", "verified"]),
    supabase.from("reviews").select("rating, rating_environment, rating_cleanliness, rating_service, rating_value", { count: "exact" }).eq("homestay_id", homestay.id),
    supabase.from("reviews").select("*, bookings(guest_province)").eq("homestay_id", homestay.id).order("created_at", { ascending: false }).range(0, GRID_REVIEWS - 1),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]),
    supabase.from("bookings").select("created_at").eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("bookings").select("room_id").eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]).not("room_id", "is", null),
  ]);

  const host = hostRow as unknown as Host | null;
  const roomsWithJoins = (roomRows as unknown as (Room & { room_seasonal_prices: RoomSeasonalPrice[]; room_special_prices: RoomSpecialPrice[]; room_options: RoomOption[]; room_guest_pricing: RoomGuestPricing[] })[]) || [];
  const rooms = roomsWithJoins.map(({ room_seasonal_prices: _, room_special_prices: _s, room_options: _o, room_guest_pricing: _g, ...room }) => room as unknown as Room);
  const seasonalPrices = roomsWithJoins.flatMap((r) => r.room_seasonal_prices || []);
  const specialPrices = roomsWithJoins.flatMap((r) => (r.room_special_prices || []).filter((s) => s.is_active));
  const roomOptionsList = roomsWithJoins.flatMap((r) => (r.room_options || []).filter((o) => o.is_active));
  const guestPricingList = roomsWithJoins.flatMap((r) => (r.room_guest_pricing || []).filter((g) => g.is_active));
  const blockedDates = (blockedRows as unknown as BlockedDate[]) || [];
  const bookedRanges = (bookingRows as { room_id: string | null; check_in: string; check_out: string }[]) || [];
  const ratings = (allRatings as { rating: number; rating_environment: number | null; rating_cleanliness: number | null; rating_service: number | null; rating_value: number | null }[]) || [];
  const averageRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10) / 10
      : 0;
  const reviews = (reviewRows as unknown as (Review & { bookings: { guest_province: string | null } | null })[]) || [];

  // Category averages for preview
  const computeAvg = (key: "rating_environment" | "rating_cleanliness" | "rating_service" | "rating_value") => {
    const vals = ratings.filter((r) => r[key] != null).map((r) => r[key] as number);
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };
  const categoryAverages = {
    environment: computeAvg("rating_environment"),
    cleanliness: computeAvg("rating_cleanliness"),
    service: computeAvg("rating_service"),
    value: computeAvg("rating_value"),
  };

  let bookingDisabled = false;
  if (host) {
    bookingDisabled = isHostBlocked({
      plan_type: host.plan_type,
      plan_free_expires_at: host.plan_free_expires_at,
      has_past_due_invoice:
        host.plan_type === "fixed_rate" ? await hasPastDueInvoice(host.id, supabase) : false,
      wallet_balance: host.wallet_balance,
      wallet_credit_limit: host.wallet_credit_limit,
      wallet_negative_since: host.wallet_negative_since,
    });
  }

  const roomBookingCounts = new Map<string, number>();
  for (const row of (confirmedBookingRows as { room_id: string }[] | null) ?? []) {
    roomBookingCounts.set(row.room_id, (roomBookingCounts.get(row.room_id) ?? 0) + 1);
  }
  let mostBookedRoomId: string | null = null;
  let bestCount = 0;
  for (const [id, count] of roomBookingCounts) {
    if (count > bestCount) {
      bestCount = count;
      mostBookedRoomId = id;
    }
  }
  const hasConfirmedBookings = mostBookedRoomId !== null;
  if (!mostBookedRoomId && rooms.length > 0) {
    mostBookedRoomId = rooms[0].id;
  }

  const localized = host
    ? await localizeHomestay(
        { homestay, rooms, roomOptions: roomOptionsList, reviews, seasonalPrices, specialPrices, guestPricing: guestPricingList, host },
        locale,
      )
    : { homestay, rooms, roomOptions: roomOptionsList, reviews, seasonalPrices, specialPrices, guestPricing: guestPricingList, host };

  return {
    homestay: {
      ...localized.homestay,
      description: sanitizeRichText(localized.homestay.description),
      check_in_info: sanitizeRichText(localized.homestay.check_in_info),
      policies: sanitizeRichText(localized.homestay.policies),
      host: localized.host!,
    } as Homestay & { host: Host },
    rooms: localized.rooms.map((room) => ({
      ...room,
      description: sanitizeRichText(room.description),
    })),
    blockedDates,
    bookedRanges,
    seasonalPrices: localized.seasonalPrices,
    specialPrices: localized.specialPrices,
    roomOptions: localized.roomOptions,
    guestPricing: localized.guestPricing,
    reviews: localized.reviews,
    averageRating,
    categoryAverages,
    reviewCount: reviewCount || 0,
    totalBookings: totalBookingsCount || 0,
    lastBookingDate: (lastBookingRow as { created_at: string } | null)?.created_at || null,
    bookingDisabled,
    mostBookedRoomId,
    hasConfirmedBookings,
    // From the Thai labels the host's icon picks are keyed by — before translation rewrites them.
    amenityIcons: resolveIconKeys(homestay.amenities ?? [], homestay.amenity_icons, "amenity"),
    prohibitionIcons: resolveIconKeys(homestay.prohibitions ?? [], homestay.prohibition_icons, "rule"),
  };
});

export const notFoundMetadata: Metadata = {
  title: "Not Found",
  robots: { index: false, follow: false },
};

/** Title, description, canonical and Open Graph of a homestay's landing page; /book overrides a few. */
export function homestayMetadata(
  homestay: Pick<Homestay, "name" | "location" | "description" | "tagline">,
  slug: string,
): Metadata {
  const titleAbsolute = `${[homestay.name, homestay.location].filter(Boolean).join(" — ")} | ${SITE_NAME}`;
  const rawDescription = richTextToPlainText(homestay.description) || homestay.tagline || homestay.name;
  const description =
    rawDescription.length > 155 ? `${rawDescription.slice(0, 155).trim()}…` : rawDescription;
  const ogDescription = homestay.tagline || description;
  const canonicalPath = `/${slug}`;

  return {
    title: { absolute: titleAbsolute },
    description,
    alternates: buildAlternates(canonicalPath),
    openGraph: {
      title: homestay.name,
      description: ogDescription,
      url: canonicalPath,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: homestay.name,
      description: ogDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
  };
}
