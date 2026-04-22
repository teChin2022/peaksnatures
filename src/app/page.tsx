import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isHostBlocked } from "@/lib/plan-expiry";
import type { Homestay, Room } from "@/types/database";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingContent } from "@/components/landing/landing-content";
import { LandingFooter } from "@/components/landing/footer";
import {
  SITE_NAME,
  SITE_TITLE_DEFAULT,
  SITE_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  buildAlternates,
} from "@/lib/seo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: {
    absolute: SITE_TITLE_DEFAULT,
  },
  description: SITE_DESCRIPTION,
  alternates: buildAlternates("/"),
  openGraph: {
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    url: "/",
    type: "website",
    siteName: SITE_NAME,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

export default async function Home() {
  const supabase = createServiceRoleClient();
  const { data: homestayRows } = await supabase
    .from("homestays")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const homestays = (homestayRows as unknown as Homestay[]) || [];

  // Fetch rooms, hosts, and reviews in parallel (all depend only on homestayIds/hostIds)
  const homestayIds = homestays.map((h) => h.id);
  const hostIds = [...new Set(homestays.map((h) => h.host_id))];

  const [{ data: roomRows }, { data: hostRows }, { data: reviewRows }, { data: overdueRows }] = homestayIds.length
    ? await Promise.all([
        supabase
          .from("rooms")
          .select("homestay_id, price_per_night")
          .in("homestay_id", homestayIds)
          .eq("is_active", true),
        supabase
          .from("hosts")
          .select("id, is_verified, plan_type, plan_free_expires_at, wallet_balance, wallet_credit_limit, wallet_negative_since")
          .in("id", hostIds),
        supabase
          .from("reviews")
          .select("homestay_id, rating")
          .in("homestay_id", homestayIds),
        supabase
          .from("invoices")
          .select("host_id")
          .in("host_id", hostIds)
          .eq("status", "overdue"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const rooms = (roomRows as unknown as Pick<Room, "homestay_id" | "price_per_night">[]) || [];
  const minPriceMap = new Map<string, number>();
  for (const r of rooms) {
    const cur = minPriceMap.get(r.homestay_id);
    if (cur === undefined || r.price_per_night < cur) {
      minPriceMap.set(r.homestay_id, r.price_per_night);
    }
  }

  const overdueHostIds = new Set<string>(
    ((overdueRows as { host_id: string }[]) || []).map((r) => r.host_id),
  );

  const hostVerifiedMap = new Map<string, boolean>();
  const blockedHostIds = new Set<string>();
  for (const host of (hostRows as {
    id: string;
    is_verified: boolean;
    plan_type: string;
    plan_free_expires_at: string | null;
    wallet_balance: number | null;
    wallet_credit_limit: number | null;
    wallet_negative_since: string | null;
  }[]) || []) {
    hostVerifiedMap.set(host.id, host.is_verified);
    if (
      isHostBlocked({
        plan_type: host.plan_type,
        plan_free_expires_at: host.plan_free_expires_at,
        has_overdue_invoice: overdueHostIds.has(host.id),
        wallet_balance: host.wallet_balance ?? 0,
        wallet_credit_limit: host.wallet_credit_limit,
        wallet_negative_since: host.wallet_negative_since,
      })
    ) {
      blockedHostIds.add(host.id);
    }
  }

  const reviewData = (reviewRows as { homestay_id: string; rating: number }[]) || [];
  const reviewCountMap = new Map<string, number>();
  const reviewSumMap = new Map<string, number>();
  for (const rv of reviewData) {
    reviewCountMap.set(rv.homestay_id, (reviewCountMap.get(rv.homestay_id) || 0) + 1);
    reviewSumMap.set(rv.homestay_id, (reviewSumMap.get(rv.homestay_id) || 0) + rv.rating);
  }

  // Filter out homestays whose host is soft-blocked (expired free plan past grace period)
  const activeHomestays = homestays.filter((h) => !blockedHostIds.has(h.host_id));

  const homestayData = activeHomestays.map((h) => {
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
