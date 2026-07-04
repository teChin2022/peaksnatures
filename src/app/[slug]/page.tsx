import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import dynamic from "next/dynamic";
import { notFound, permanentRedirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { isHostBlocked } from "@/lib/plan-expiry";
import { evaluatePromoCode } from "@/lib/promo-codes";
import { localizeHomestay } from "@/lib/translation/translate-homestay";
import { sanitizeRichText } from "@/lib/sanitize";
import type { SupportedLocale } from "@/lib/translation/types";
import type { Homestay, Room, BlockedDate, Host, Review, RoomSeasonalPrice, RoomOption, RoomGuestPricing, PromoCode } from "@/types/database";
import { HeroSection } from "@/components/booking/hero-section";
import { GallerySection } from "@/components/booking/gallery-section";
import { AboutSection } from "@/components/booking/about-section";
import { RoomsSection } from "@/components/booking/rooms-section";
import { BookingCartProvider } from "@/components/booking/booking-cart-context";
import { BookingDateBar } from "@/components/booking/booking-date-bar";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingFooter } from "@/components/booking/booking-footer";
import { HostLocationSection } from "@/components/booking/host-location-section";
import { CheckInInfoSection } from "@/components/booking/check-in-info-section";
import { PoliciesSection } from "@/components/booking/policies-section";
import { FaqSection } from "@/components/booking/faq-section";
import { FinalCtaSection } from "@/components/booking/final-cta-section";
import { ReviewsDisplay } from "@/components/reviews/reviews-display";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const BookingSection = dynamic(() => import("@/components/booking/booking-section").then((m) => m.BookingSection));
const MobileBookingBar = dynamic(() => import("@/components/booking/mobile-booking-bar").then((m) => m.MobileBookingBar));


export const revalidate = 30;

const EMPTY_POPULAR_ROOM_IDS: ReadonlySet<string> = new Set();

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ promo?: string }>;
}

export type InitialPromoInfo = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  recommender_name: string | null;
};

const getPromoLinkInfo = cache(async function getPromoLinkInfo(
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

async function readLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  return cookieStore.get("locale")?.value === "en" ? "en" : "th";
}

const getHomestayData = cache(async function getHomestayData(
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
    supabase.from("rooms").select("*, room_seasonal_prices(*), room_options(*), room_guest_pricing(*)").eq("homestay_id", homestay.id).order("created_at", { ascending: true }),
    supabase.from("blocked_dates").select("*").eq("homestay_id", homestay.id),
    supabase.from("bookings").select("room_id, check_in, check_out").eq("homestay_id", homestay.id).in("status", ["pending", "confirmed", "verified"]),
    supabase.from("reviews").select("rating, rating_environment, rating_cleanliness, rating_service, rating_value", { count: "exact" }).eq("homestay_id", homestay.id),
    supabase.from("reviews").select("*, bookings(guest_province)").eq("homestay_id", homestay.id).order("created_at", { ascending: false }).range(0, GRID_REVIEWS - 1),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]),
    supabase.from("bookings").select("created_at").eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("bookings").select("room_id").eq("homestay_id", homestay.id).in("status", ["confirmed", "completed"]).not("room_id", "is", null),
  ]);

  const host = hostRow as unknown as Host | null;
  const roomsWithJoins = (roomRows as unknown as (Room & { room_seasonal_prices: RoomSeasonalPrice[]; room_options: RoomOption[]; room_guest_pricing: RoomGuestPricing[] })[]) || [];
  const rooms = roomsWithJoins.map(({ room_seasonal_prices: _, room_options: _o, room_guest_pricing: _g, ...room }) => room as unknown as Room);
  const seasonalPrices = roomsWithJoins.flatMap((r) => r.room_seasonal_prices || []);
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
    const { data: overdueRows } =
      host.plan_type === "fixed_rate"
        ? await supabase
            .from("invoices")
            .select("id")
            .eq("host_id", host.id)
            .eq("status", "overdue")
            .limit(1)
        : { data: [] as unknown[] };
    bookingDisabled = isHostBlocked({
      plan_type: host.plan_type,
      plan_free_expires_at: host.plan_free_expires_at,
      has_overdue_invoice: ((overdueRows as unknown[] | null)?.length ?? 0) > 0,
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
        { homestay, rooms, roomOptions: roomOptionsList, reviews, seasonalPrices, guestPricing: guestPricingList, host },
        locale,
      )
    : { homestay, rooms, roomOptions: roomOptionsList, reviews, seasonalPrices, guestPricing: guestPricingList, host };

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
  };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const data = await getHomestayData(slug, locale);

  if (!data) {
    return {
      title: "Not Found",
      robots: { index: false, follow: false },
    };
  }

  const { homestay } = data;
  const titleAbsolute = `${homestay.name} — Book Now | ${SITE_NAME}`;
  const rawDescription = homestay.description || homestay.tagline || homestay.name;
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

export default async function HomestayPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { promo: promoParam } = await searchParams;
  const locale = await readLocale();
  const data = await getHomestayData(slug, locale);

  if (!data) {
    // Check if this is an old slug that should redirect
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) {
      permanentRedirect(`/${newSlug}`);
    }
    notFound();
  }

  const { homestay, rooms, blockedDates, bookedRanges, seasonalPrices, roomOptions, guestPricing, reviews, averageRating, categoryAverages, reviewCount, totalBookings, lastBookingDate, bookingDisabled, mostBookedRoomId, hasConfirmedBookings } = data;

  const initialPromo =
    promoParam && homestay.promo_codes_enabled
      ? await getPromoLinkInfo(homestay.id, promoParam)
      : null;

  const activeRooms = rooms.filter((r) => r.is_active);
  const inactiveRooms = rooms.filter((r) => !r.is_active);

  // Shared cart catalog — powers the sticky date bar, room-card "Add to cart",
  // the cart modal, and the booking panel from one source of truth.
  const cartCatalog = {
    rooms: activeRooms,
    seasonalPrices,
    roomOptions,
    guestPricing,
    blockedDates,
    bookedRanges,
  };

  const popularRoomId = hasConfirmedBookings && mostBookedRoomId && activeRooms.some((r) => r.id === mostBookedRoomId) ? mostBookedRoomId : null;
  const popularRoomIds = popularRoomId ? new Set<string>([popularRoomId]) : EMPTY_POPULAR_ROOM_IDS;
  const sortedActiveRooms = popularRoomId
    ? [...activeRooms.filter((r) => r.id === popularRoomId), ...activeRooms.filter((r) => r.id !== popularRoomId)]
    : activeRooms;
  const sortedRooms = [...sortedActiveRooms, ...inactiveRooms];

  const pageUrl = `${SITE_URL}/${homestay.slug}`;
  const roomPrices = activeRooms
    .map((r) => r.price_per_night)
    .filter((p): p is number => typeof p === "number" && p > 0);
  const minRoomPrice = roomPrices.length > 0 ? Math.min(...roomPrices) : null;

  const lodgingLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": pageUrl,
    name: homestay.name,
    description: homestay.description,
    url: pageUrl,
    image: [homestay.hero_image_url, ...(homestay.gallery || [])].filter(Boolean),
    address: {
      "@type": "PostalAddress",
      addressLocality: homestay.location,
      addressCountry: "TH",
    },
    amenityFeature: (homestay.amenities || []).map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    petsAllowed: (homestay.prohibitions || []).some((p) => /pet|สัตว์/i.test(p)) ? false : undefined,
  };
  if (minRoomPrice !== null) {
    lodgingLd.priceRange = `฿${minRoomPrice.toLocaleString()}+`;
    lodgingLd.makesOffer = activeRooms.map((r) => ({
      "@type": "Offer",
      name: r.name,
      price: r.price_per_night,
      priceCurrency: "THB",
      availability: "https://schema.org/InStock",
    }));
  }
  if (reviewCount > 0 && averageRating > 0) {
    lodgingLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: averageRating,
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  if (reviews.length > 0) {
    lodgingLd.review = reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.guest_name },
      datePublished: r.created_at,
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      reviewBody: r.comment ?? undefined,
    }));
  }

  const breadcrumbItems = [
    { label: SITE_NAME, href: "/" },
    { label: homestay.name },
  ];

  const faqItems = (homestay.faq || []).filter(
    (f) => f.question?.trim() && f.answer?.trim(),
  );
  const faqLd = faqItems.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={lodgingLd} id="ld-lodging" />
      {faqLd && <JsonLd data={faqLd} id="ld-faq" />}
      <BookingHeader homestayName={homestay.name} logoUrl={homestay.logo_url} slug={homestay.slug} />

      <BookingCartProvider catalog={cartCatalog} homestayId={homestay.id}>
      <BookingDateBar />
      <main className="pb-28 md:pb-0">
        <Breadcrumbs items={breadcrumbItems} visuallyHidden />
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
            rooms={activeRooms}
            blockedDates={blockedDates}
            bookedRanges={bookedRanges}
            host={homestay.host}
            seasonalPrices={seasonalPrices}
            roomOptions={roomOptions}
            guestPricing={guestPricing}
            bookingDisabled={bookingDisabled}
            initialPromo={initialPromo}
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

      <MobileBookingBar
        rooms={rooms}
        seasonalPrices={seasonalPrices}
        mostBookedRoomId={mostBookedRoomId}
        hasConfirmedBookings={hasConfirmedBookings}
        bookingDisabled={bookingDisabled}
      />
      </BookingCartProvider>

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
    </div>
  );
}
