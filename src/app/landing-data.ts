import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchPastDueHostIds } from "@/lib/billing";
import type { Homestay } from "@/types/database";

/*
 * Data for the platform landing (/). Server only: it reads with the
 * service-role client, so never import it from a "use client" file.
 */

export async function loadLandingRows() {
  const supabase = createServiceRoleClient();
  const { data: homestayRows, error: homestayError } = await supabase
    .from("homestays")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (homestayError) throw homestayError;
  const homestays = (homestayRows as unknown as Homestay[]) || [];

  // Fetch rooms, hosts, and reviews in parallel (all depend only on homestayIds/hostIds)
  const homestayIds = homestays.map((h) => h.id);
  const hostIds = [...new Set(homestays.map((h) => h.host_id))];

  const [rooms, hosts, reviews, pastDueHostIds, bookings] = homestayIds.length
    ? await Promise.all([
        supabase
          .from("rooms")
          .select("id, homestay_id, price_per_night, max_guests, quantity, room_seasonal_prices(room_id, start_date, end_date, price_per_night)")
          .in("homestay_id", homestayIds)
          .eq("is_active", true),
        supabase
          .from("hosts")
          .select("id, status, is_verified, plan_type, plan_free_expires_at, wallet_balance, wallet_credit_limit, wallet_negative_since")
          .in("id", hostIds),
        supabase
          .from("reviews")
          .select("homestay_id, rating, would_return")
          .in("homestay_id", homestayIds),
        fetchPastDueHostIds(hostIds, supabase),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("status", ["confirmed", "completed"]),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, new Set<string>(), { count: 0, error: null }];
  const failed = [rooms, hosts, reviews, bookings].find((r) => r.error);
  if (failed) throw failed.error;

  return {
    homestays,
    roomRows: rooms.data,
    hostRows: hosts.data,
    reviewRows: reviews.data,
    pastDueHostIds: [...pastDueHostIds], // a Set does not survive the cache's JSON
    confirmedBookings: bookings.count,
  };
}

/**
 * The root layout reads the locale cookie, so / renders on every request and
 * its `revalidate` never applies. This 60s data cache is what keeps a visit
 * off the database. A failed read throws so it is never cached.
 */
export const getLandingRows = unstable_cache(loadLandingRows, ["landing-rows"], { revalidate: 60 });
