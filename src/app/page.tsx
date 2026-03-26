import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay, Room } from "@/types/database";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingContent } from "@/components/landing/landing-content";
import { LandingFooter } from "@/components/landing/footer";

export const revalidate = 60;

export default async function Home() {
  const supabase = createServiceRoleClient();
  const { data: homestayRows } = await supabase
    .from("homestays")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const homestays = (homestayRows as unknown as Homestay[]) || [];

  // Fetch all rooms for active homestays to derive min price
  const homestayIds = homestays.map((h) => h.id);
  const { data: roomRows } = homestayIds.length
    ? await supabase
        .from("rooms")
        .select("homestay_id, price_per_night")
        .in("homestay_id", homestayIds)
        .eq("is_active", true)
    : { data: [] };
  const rooms = (roomRows as unknown as Pick<Room, "homestay_id" | "price_per_night">[]) || [];

  const minPriceMap = new Map<string, number>();
  for (const r of rooms) {
    const cur = minPriceMap.get(r.homestay_id);
    if (cur === undefined || r.price_per_night < cur) {
      minPriceMap.set(r.homestay_id, r.price_per_night);
    }
  }

  // Fetch host verification status
  const hostIds = [...new Set(homestays.map((h) => h.host_id))];
  const { data: hostRows } = hostIds.length
    ? await supabase
        .from("hosts")
        .select("id, is_verified")
        .in("id", hostIds)
    : { data: [] };
  const hostVerifiedMap = new Map<string, boolean>();
  for (const host of (hostRows as { id: string; is_verified: boolean }[]) || []) {
    hostVerifiedMap.set(host.id, host.is_verified);
  }

  // Fetch review stats per homestay
  const { data: reviewRows } = homestayIds.length
    ? await supabase
        .from("reviews")
        .select("homestay_id, rating")
        .in("homestay_id", homestayIds)
    : { data: [] };
  const reviewData = (reviewRows as { homestay_id: string; rating: number }[]) || [];
  const reviewCountMap = new Map<string, number>();
  const reviewSumMap = new Map<string, number>();
  for (const rv of reviewData) {
    reviewCountMap.set(rv.homestay_id, (reviewCountMap.get(rv.homestay_id) || 0) + 1);
    reviewSumMap.set(rv.homestay_id, (reviewSumMap.get(rv.homestay_id) || 0) + rv.rating);
  }

  const homestayData = homestays.map((h) => {
    const count = reviewCountMap.get(h.id) || 0;
    const sum = reviewSumMap.get(h.id) || 0;
    return {
      slug: h.slug,
      name: h.name,
      location: h.location,
      hero_image_url: h.hero_image_url,
      gallery: h.gallery || [],
      min_price: minPriceMap.get(h.id) ?? null,
      max_guests: h.max_guests,
      tagline: h.tagline,
      review_count: count,
      average_rating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      is_host_verified: hostVerifiedMap.get(h.host_id) ?? false,
      created_at: h.created_at,
    };
  });

  homestayData.sort((a, b) => {
    if (a.average_rating > 0 && b.average_rating === 0) return -1;
    if (a.average_rating === 0 && b.average_rating > 0) return 1;
    if (a.average_rating > 0 && b.average_rating > 0) return b.average_rating - a.average_rating;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-gray-200">
      <LandingNavbar />
      <main>
        <LandingContent homestays={homestayData} />
      </main>
      <LandingFooter />
    </div>
  );
}
