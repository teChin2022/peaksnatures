import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { bookingPath } from "@/lib/booking-path";
import { HeroSection } from "@/components/booking/hero-section";
import { DesktopDateSearch } from "@/components/booking/desktop-date-search";
import { AvailabilityCalendarSection } from "@/components/booking/availability-calendar-section";
import { RoomsSection } from "@/components/booking/rooms-section";
import { BookingCartProvider } from "@/components/booking/booking-cart-context";
import { DemandTracker } from "@/components/booking/demand-tracker";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingFooter } from "@/components/booking/booking-footer";
import { FinalCtaSection } from "@/components/booking/final-cta-section";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { SITE_NAME, buildAlternates } from "@/lib/seo";
import { toBookingHost } from "@/lib/public-host";
import { getHomestayData, getPromoLinkInfo, homestayMetadata, notFoundMetadata, readLocale } from "../data";

const BookingSection = dynamic(() => import("@/components/booking/booking-section").then((m) => m.BookingSection));
const MobileBookingBar = dynamic(() => import("@/components/booking/mobile-booking-bar").then((m) => m.MobileBookingBar));


export const revalidate = 30;

const EMPTY_POPULAR_ROOM_IDS: ReadonlySet<string> = new Set();

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ promo?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayData(slug, await readLocale());
  if (!data) return notFoundMetadata;

  const tb = await getTranslations("booking");
  const base = homestayMetadata(data.homestay, slug);
  // [slug]/opengraph-image only reaches its own segment, so /book names it:
  // promo links land here and LINE/Facebook previews read this page.
  const images = [`/${slug}/opengraph-image`];
  return {
    ...base,
    title: { absolute: `${data.homestay.name} — ${tb("bookHouse")} | ${SITE_NAME}` },
    alternates: buildAlternates(`/${slug}/book`),
    openGraph: { ...base.openGraph, images },
    twitter: { ...base.twitter, images },
    // The landing (/{slug}) is the page to rank; this one only takes the booking.
    robots: { index: false, follow: true },
  };
}

export default async function HomestayBookingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { promo: promoParam } = await searchParams;
  const locale = await readLocale();
  const data = await getHomestayData(slug, locale);

  if (!data) {
    // Check if this is an old slug that should redirect, keeping a promo code
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) {
      permanentRedirect(bookingPath(newSlug, promoParam));
    }
    notFound();
  }

  const { homestay, rooms, blockedDates, bookedRanges, seasonalPrices, specialPrices, roomOptions, guestPricing, averageRating, reviewCount, bookingDisabled, mostBookedRoomId, hasConfirmedBookings } = data;

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
    specialPrices,
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

  const tb = await getTranslations("booking");

  const breadcrumbItems = [
    { label: SITE_NAME, href: "/" },
    { label: homestay.name, href: `/${homestay.slug}` },
    { label: tb("bookHouse") },
  ];

  // The booking form is a client component: its props land in the page source,
  // so it gets the homestay without the host row, and only the host fields it reads.
  const { host, ...homestayForClient } = homestay;
  const bookingHost = toBookingHost(host);

  return (
    <div className="min-h-screen bg-white">
      <BookingCartProvider catalog={cartCatalog} homestayId={homestay.id}>
      <DemandTracker homestayId={homestay.id} />
      <BookingHeader
        homestayName={homestay.name}
        logoUrl={homestay.logo_url}
        slug={homestay.slug}
        homestayId={homestay.id}
        // Hidden when the host turned drafts off, and when bookings are
        // blocked at all — restoring into a dead form helps nobody.
        resumeEnabled={(homestay.host.booking_draft_hours ?? 0) > 0 && !bookingDisabled}
      />

      <main className="pb-28 md:pb-0">
        <Breadcrumbs items={breadcrumbItems} visuallyHidden />
        <HeroSection
          name={homestay.name}
          tagline={homestay.tagline}
          heroImageUrl={homestay.hero_image_url}
          isVerified={homestay.host.is_verified}
          averageRating={averageRating}
          reviewCount={reviewCount}
          cancellationDays={homestay.host.cancellation_days}
          detailsHref={`/${homestay.slug}`}
          // location={homestay.location}
        />

        <DesktopDateSearch bookingDisabled={bookingDisabled} />

        <AvailabilityCalendarSection homestayId={homestay.id} />

        <RoomsSection rooms={sortedRooms} seasonalPrices={seasonalPrices} specialPrices={specialPrices} bookedRanges={bookedRanges} blockedDates={blockedDates} popularRoomIds={popularRoomIds} />

        {/* Booking (inline) */}
        <div className="bg-earth-50">
          <BookingSection
            homestay={homestayForClient}
            rooms={activeRooms}
            blockedDates={blockedDates}
            bookedRanges={bookedRanges}
            host={bookingHost}
            seasonalPrices={seasonalPrices}
            specialPrices={specialPrices}
            roomOptions={roomOptions}
            guestPricing={guestPricing}
            bookingDisabled={bookingDisabled}
            initialPromo={initialPromo}
          />
        </div>

        <FinalCtaSection />
      </main>

      <MobileBookingBar
        rooms={rooms}
        bookingDisabled={bookingDisabled}
      />
      </BookingCartProvider>

      <BookingFooter
        homestayName={homestay.name}
        logoUrl={homestay.logo_url}
        location={homestay.location}
        hostName={homestay.host.name}
        hostPhone={homestay.host.phone}
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
