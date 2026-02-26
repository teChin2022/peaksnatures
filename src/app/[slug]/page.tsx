import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay, Room, BlockedDate, Host, Review, RoomSeasonalPrice } from "@/types/database";
import { HeroSection } from "@/components/booking/hero-section";
import { GallerySection } from "@/components/booking/gallery-section";
import { AboutSection } from "@/components/booking/about-section";
import { RoomsSection } from "@/components/booking/rooms-section";
import { BookingSection } from "@/components/booking/booking-section";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingFooter } from "@/components/booking/booking-footer";
import { MapRulesSection } from "@/components/booking/map-rules-section";
import { ChatWidget } from "@/components/chat/chat-widget";


export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function resolveSlugRedirect(slug: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("homestay_slug_redirects" as never)
    .select("homestay_id")
    .eq("old_slug", slug)
    .single();
  if (!data) return null;
  const homestayId = (data as unknown as { homestay_id: string }).homestay_id;
  const { data: homestay } = await supabase
    .from("homestays")
    .select("slug")
    .eq("id", homestayId)
    .eq("is_active", true)
    .single();
  return (homestay as unknown as { slug: string } | null)?.slug || null;
}

async function getHomestayData(slug: string) {
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
  const INITIAL_REVIEWS = 5;
  const [
    { data: hostRow },
    { data: roomRows },
    { data: blockedRows },
    { data: bookingRows },
    { count: reviewCount },
    { data: avgRow },
    { data: reviewRows },
  ] = await Promise.all([
    supabase.from("hosts").select("*").eq("id", homestay.host_id).single(),
    supabase.from("rooms").select("*").eq("homestay_id", homestay.id),
    supabase.from("blocked_dates").select("*").eq("homestay_id", homestay.id),
    supabase.from("bookings").select("room_id, check_in, check_out").eq("homestay_id", homestay.id).in("status", ["pending", "confirmed", "verified"]),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id),
    supabase.from("reviews").select("rating").eq("homestay_id", homestay.id),
    supabase.from("reviews").select("*").eq("homestay_id", homestay.id).order("created_at", { ascending: false }).range(0, INITIAL_REVIEWS - 1),
  ]);

  const host = hostRow as unknown as Host | null;
  const rooms = (roomRows as unknown as Room[]) || [];
  const blockedDates = (blockedRows as unknown as BlockedDate[]) || [];
  const bookedRanges = (bookingRows as { room_id: string | null; check_in: string; check_out: string }[]) || [];
  const allRatings = (avgRow as { rating: number }[]) || [];
  const averageRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length) * 10) / 10
      : 0;
  const reviews = (reviewRows as unknown as Review[]) || [];

  // Fetch seasonal prices (depends on rooms result)
  const roomIds = rooms.map((r) => r.id);
  let seasonalPrices: RoomSeasonalPrice[] = [];
  if (roomIds.length > 0) {
    const { data: seasonRows } = await supabase
      .from("room_seasonal_prices")
      .select("*")
      .in("room_id", roomIds)
      .order("start_date");
    seasonalPrices = (seasonRows as unknown as RoomSeasonalPrice[]) || [];
  }

  return {
    homestay: { ...homestay, host: host! } as Homestay & { host: Host },
    rooms,
    blockedDates,
    bookedRanges,
    seasonalPrices,
    reviews,
    averageRating,
    reviewCount: reviewCount || 0,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayData(slug);

  if (!data) {
    return { title: "Not Found — PeaksNature" };
  }

  const { homestay } = data;
  return {
    title: `${homestay.name} — Book Now | PeaksNature`,
    description: `${homestay.description.slice(0, 155)}...`,
    openGraph: {
      title: homestay.name,
      description: homestay.tagline || homestay.description.slice(0, 155),
      images: homestay.hero_image_url ? [{ url: homestay.hero_image_url }] : [],
    },
  };
}

export default async function HomestayPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHomestayData(slug);

  if (!data) {
    // Check if this is an old slug that should redirect
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) {
      permanentRedirect(`/${newSlug}`);
    }
    notFound();
  }

  const { homestay, rooms, blockedDates, bookedRanges, seasonalPrices, reviews, averageRating, reviewCount } = data;

  return (
    <div className="min-h-screen bg-white">
      <BookingHeader homestayName={homestay.name} themeColor={homestay.theme_color} logoUrl={homestay.logo_url} homestayId={homestay.id} promptpayId={homestay.host.promptpay_id} hostName={homestay.host.name} />

      <main>
        <HeroSection
          name={homestay.name}
          tagline={homestay.tagline}
          heroImageUrl={homestay.hero_image_url}
          themeColor={homestay.theme_color}
        />

        <GallerySection images={homestay.gallery} name={homestay.name} />

        <AboutSection
          description={homestay.description}
          amenities={homestay.amenities}
          maxGuests={homestay.max_guests}
          location={homestay.location}
          themeColor={homestay.theme_color}
        />
        
        <RoomsSection rooms={rooms} themeColor={homestay.theme_color} seasonalPrices={seasonalPrices} />

        <MapRulesSection
          mapEmbedUrl={homestay.map_embed_url}
          location={homestay.location}
          prohibitions={homestay.prohibitions}
          themeColor={homestay.theme_color}
        />

        {/* Booking Form */}
        <section className="py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <BookingSection
              homestay={homestay}
              rooms={rooms}
              blockedDates={blockedDates}
              bookedRanges={bookedRanges}
              host={homestay.host}
              embedded
              reviews={reviews}
              averageRating={averageRating}
              reviewCount={reviewCount}
              seasonalPrices={seasonalPrices}
            />
          </div>
        </section>
      </main>

      <BookingFooter
        homestayName={homestay.name}
        themeColor={homestay.theme_color}
        logoUrl={homestay.logo_url}
        location={homestay.location}
        hostName={homestay.host.name}
      />

      {/* <ChatWidget
        homestayId={homestay.id}
        homestayName={homestay.name}
        themeColor={homestay.theme_color}
      /> */}
    </div>
  );
}
