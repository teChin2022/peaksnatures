import { cache } from "react";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound, permanentRedirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { isHostBlocked } from "@/lib/plan-expiry";
import type { Homestay, Room, BlockedDate, Host, Review, RoomSeasonalPrice, RoomOption } from "@/types/database";
import { HeroSection } from "@/components/booking/hero-section";
import { GallerySection } from "@/components/booking/gallery-section";
import { AboutSection } from "@/components/booking/about-section";
import { RoomsSection } from "@/components/booking/rooms-section";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingFooter } from "@/components/booking/booking-footer";
import { HostLocationSection } from "@/components/booking/host-location-section";
import { CheckInInfoSection } from "@/components/booking/check-in-info-section";
import { PoliciesSection } from "@/components/booking/policies-section";
import { FaqSection } from "@/components/booking/faq-section";
import { FinalCtaSection } from "@/components/booking/final-cta-section";
import { ReviewsDisplay } from "@/components/reviews/reviews-display";

const BookingSection = dynamic(() => import("@/components/booking/booking-section").then((m) => m.BookingSection));
const ChatWidget = dynamic(() => import("@/components/chat/chat-widget").then((m) => m.ChatWidget));
const MobileBookingBar = dynamic(() => import("@/components/booking/mobile-booking-bar").then((m) => m.MobileBookingBar));


export const revalidate = 30;

const EMPTY_POPULAR_ROOM_IDS: ReadonlySet<string> = new Set();

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getHomestayData = cache(async function getHomestayData(slug: string) {
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
    supabase.from("rooms").select("*, room_seasonal_prices(*), room_options(*)").eq("homestay_id", homestay.id).eq("is_active", true).order("created_at", { ascending: true }),
    supabase.from("blocked_dates").select("*").eq("homestay_id", homestay.id),
    supabase.from("bookings").select("room_id, check_in, check_out").eq("homestay_id", homestay.id).in("status", ["pending", "confirmed", "verified"]),
    supabase.from("reviews").select("rating, rating_environment, rating_cleanliness, rating_service, rating_value", { count: "exact" }).eq("homestay_id", homestay.id),
    supabase.from("reviews").select("*, bookings(guest_province)").eq("homestay_id", homestay.id).order("created_at", { ascending: false }).range(0, GRID_REVIEWS - 1),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]),
    supabase.from("bookings").select("created_at").eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("bookings").select("room_id").eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]).not("room_id", "is", null),
  ]);

  const host = hostRow as unknown as Host | null;
  const roomsWithJoins = (roomRows as unknown as (Room & { room_seasonal_prices: RoomSeasonalPrice[]; room_options: RoomOption[] })[]) || [];
  const rooms = roomsWithJoins.map(({ room_seasonal_prices: _, room_options: _o, ...room }) => room as unknown as Room);
  const seasonalPrices = roomsWithJoins.flatMap((r) => r.room_seasonal_prices || []);
  const roomOptionsList = roomsWithJoins.flatMap((r) => (r.room_options || []).filter((o) => o.is_active));
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

  const bookingDisabled = host ? isHostBlocked(host.plan_type, host.plan_free_expires_at) : false;

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

  return {
    homestay: { ...homestay, host: host! } as Homestay & { host: Host },
    rooms,
    blockedDates,
    bookedRanges,
    seasonalPrices,
    roomOptions: roomOptionsList,
    reviews,
    averageRating,
    categoryAverages,
    reviewCount: reviewCount || 0,
    totalBookings: totalBookingsCount || 0,
    lastBookingDate: (lastBookingRow as { created_at: string } | null)?.created_at || null,
    bookingDisabled,
    mostBookedRoomId,
    hasConfirmedBookings,
  };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayData(slug);

  if (!data) {
    return { title: "Not Found — Peaksnature" };
  }

  const { homestay } = data;
  return {
    title: `${homestay.name} — Book Now | Peaksnature`,
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

  const { homestay, rooms, blockedDates, bookedRanges, seasonalPrices, roomOptions, reviews, averageRating, categoryAverages, reviewCount, totalBookings, lastBookingDate, bookingDisabled, mostBookedRoomId, hasConfirmedBookings } = data;

  const popularRoomId = hasConfirmedBookings && mostBookedRoomId && rooms.some((r) => r.id === mostBookedRoomId) ? mostBookedRoomId : null;
  const popularRoomIds = popularRoomId ? new Set<string>([popularRoomId]) : EMPTY_POPULAR_ROOM_IDS;
  const sortedRooms = popularRoomId
    ? [...rooms.filter((r) => r.id === popularRoomId), ...rooms.filter((r) => r.id !== popularRoomId)]
    : rooms;

  return (
    <div className="min-h-screen bg-white">
      <BookingHeader homestayName={homestay.name} logoUrl={homestay.logo_url} homestayId={homestay.id} promptpayId={homestay.host.promptpay_id} hostName={homestay.host.name} cancellationDays={homestay.host.cancellation_days} paymentDisplay={homestay.host.payment_display} bankName={homestay.host.bank_name} bankAccountNumber={homestay.host.bank_account_number} bankAccountName={homestay.host.bank_account_name} />

      <main className="pb-16 md:pb-0">
        <HeroSection
          name={homestay.name}
          tagline={homestay.tagline}
          heroImageUrl={homestay.hero_image_url}
          isVerified={homestay.host.is_verified}
          averageRating={averageRating}
          reviewCount={reviewCount}
          // location={homestay.location}
        />

        <GallerySection images={homestay.gallery} name={homestay.name} />

        <div className="bg-earth-50">
          <HostLocationSection
            hostName={homestay.host.name}
            hostPhone={homestay.host.phone}
            hostAvatarUrl={homestay.host.avatar_url}
            isVerified={homestay.host.is_verified}
            hostCreatedAt={homestay.host.created_at}
            totalBookings={totalBookings}
            lastBookingDate={lastBookingDate}
            location={homestay.location}
            mapEmbedUrl={homestay.map_embed_url}
          />
        </div>

        <RoomsSection rooms={sortedRooms} seasonalPrices={seasonalPrices} bookedRanges={bookedRanges} blockedDates={blockedDates} popularRoomIds={popularRoomIds} />

        {/* Booking (inline) */}
        <div className="bg-earth-50">
          <BookingSection
            homestay={homestay}
            rooms={rooms}
            blockedDates={blockedDates}
            bookedRanges={bookedRanges}
            host={homestay.host}
            seasonalPrices={seasonalPrices}
            roomOptions={roomOptions}
            bookingDisabled={bookingDisabled}
          />
        </div>

        <AboutSection
          description={homestay.description}
          amenities={homestay.amenities}
          maxGuests={homestay.max_guests}
          location={homestay.location}
          prohibitions={homestay.prohibitions}
        />

        <div className="bg-earth-50">
          <CheckInInfoSection content={homestay.check_in_info} />
          <PoliciesSection content={homestay.policies} />
          <FaqSection items={homestay.faq} />
        </div>

        {/* Reviews */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <ReviewsDisplay
              reviews={reviews}
              averageRating={averageRating}
              totalCount={reviewCount}
              categoryAverages={categoryAverages}
              homestayId={homestay.id}
              homestaySlug={homestay.slug}
            />
          </div>
        </section>

        <FinalCtaSection />
      </main>

      <BookingFooter
        homestayName={homestay.name}
        logoUrl={homestay.logo_url}
        location={homestay.location}
        hostName={homestay.host.name}
        socialLinks={{
          facebook_url: homestay.facebook_url,
          tiktok_url: homestay.tiktok_url,
          instagram_url: homestay.instagram_url,
          line_id: homestay.line_id,
        }}
      />

      {/* <ChatWidget
        homestayId={homestay.id}
        homestayName={homestay.name}
        themeColor={homestay.theme_color}
      /> */}

      <MobileBookingBar
        rooms={rooms}
        seasonalPrices={seasonalPrices}
        mostBookedRoomId={mostBookedRoomId}
        hasConfirmedBookings={hasConfirmedBookings}
        bookingDisabled={bookingDisabled}
      />
    </div>
  );
}
