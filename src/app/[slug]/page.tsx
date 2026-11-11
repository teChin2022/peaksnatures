import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { richTextToPlainText } from "@/lib/sanitize";
import { bookingPath } from "@/lib/booking-path";
import { lowestNightlyPrice } from "@/lib/calculate-price";
import { billingTodayStr } from "@/lib/billing-dates";
import { upcomingSeasons } from "@/lib/room-rates";
import { galleryPhotos } from "@/lib/gallery-layout";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingFooter } from "@/components/booking/booking-footer";
import { LandingHero } from "@/components/booking/landing-hero";
import { AboutSection } from "@/components/booking/about-section";
import { GallerySection } from "@/components/booking/gallery-section";
import { HostLocationSection } from "@/components/booking/host-location-section";
import { CheckInInfoSection } from "@/components/booking/check-in-info-section";
import { PoliciesSection } from "@/components/booking/policies-section";
import { FaqSection } from "@/components/booking/faq-section";
import { LandingBookBar, LandingCta } from "@/components/booking/landing-cta";
import { PageViewTracker } from "@/components/booking/page-view-tracker";
import { SectionMark } from "@/components/booking/section-mark";
import { RespectReducedMotion } from "@/components/respect-reduced-motion";
import { ReviewsDisplay } from "@/components/reviews/reviews-display";
import { LandingRooms, type LandingRoom } from "@/components/booking/landing-rooms";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { getHomestayData, homestayMetadata, notFoundMetadata, readLocale } from "./data";

export const revalidate = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ promo?: string | string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayData(slug, await readLocale());
  return data ? homestayMetadata(data.homestay, slug) : notFoundMetadata;
}

/**
 * The homestay's landing page: what guests read before they book. Booking
 * itself happens on /[slug]/book.
 */
export default async function HomestayLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { promo } = await searchParams;
  // Promo links (dashboard, recommenders) skip the landing: that guest came to book.
  if (promo !== undefined) redirect(bookingPath(slug, promo));

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

  const { homestay, rooms, seasonalPrices, reviews, averageRating, categoryAverages, reviewCount, totalBookings, lastBookingDate, amenityIcons, prohibitionIcons, bookingDisabled } = data;

  const activeRooms = rooms.filter((r) => r.is_active);
  // No open house means nothing to book: the landing shows the booking-off notice instead of Book links. /book is unchanged.
  const canBook = !bookingDisabled && activeRooms.length > 0;
  // The "from" price counts only seasons that have not ended: an ended one can't be booked.
  const fromPrice = lowestNightlyPrice(activeRooms, upcomingSeasons(seasonalPrices, billingTodayStr()));
  const bookHref = bookingPath(homestay.slug);
  const photos = galleryPhotos(homestay.gallery || [], activeRooms.map((r) => r.images ?? []));
  // Every house, bookable ones first as on the booking page; only the fields the cards show.
  const landingRooms: LandingRoom[] = [...activeRooms, ...rooms.filter((r) => !r.is_active)].map((r) => ({
    id: r.id,
    name: r.name,
    // Sanitized by getHomestayData; an editor left empty ("<p></p>") has no text and counts as none.
    description: richTextToPlainText(r.description) ? r.description : null,
    price_per_night: r.price_per_night,
    max_guests: r.max_guests,
    images: r.images ?? [],
    is_active: r.is_active,
  }));

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
    description: richTextToPlainText(homestay.description),
    url: pageUrl,
    image: [homestay.hero_image_url, ...(homestay.gallery || [])].filter(Boolean),
    address: {
      "@type": "PostalAddress",
      addressLocality: homestay.location,
      addressCountry: "TH",
    },
    telephone: homestay.host.phone ?? undefined,
    checkinTime: homestay.check_in_time ?? undefined,
    checkoutTime: homestay.check_out_time ?? undefined,
    sameAs: [homestay.facebook_url, homestay.instagram_url, homestay.tiktok_url].filter(Boolean),
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

  const ta = await getTranslations("about");
  const tg = await getTranslations("gallery");
  const tr = await getTranslations("reviews");
  const tf = await getTranslations("faq");
  const trm = await getTranslations("rooms");
  const tp = await getTranslations("policies");
  // Header links, in page order, only to the sections that render: each one hides itself when empty.
  // Location and policies, what guests check before paying, go in the phone menu only: the xl header row is full.
  const navItems = [
    ...(photos.length > 0 ? [{ href: "#gallery", label: tg("title") }] : []),
    { href: "#about", label: ta("title") },
    ...(homestay.amenities?.length ? [{ href: "#amenities", label: ta("amenities") }] : []),
    ...(landingRooms.length > 0 ? [{ href: "#rooms", label: trm("title") }] : []),
    ...(reviewCount > 0 ? [{ href: "#reviews", label: tr("title") }] : []),
    ...(homestay.map_embed_url ? [{ href: "#location", label: ta("location"), menuOnly: true }] : []),
    ...(richTextToPlainText(homestay.policies) ? [{ href: "#policies", label: tp("title"), menuOnly: true }] : []),
    ...(faqItems.length > 0 ? [{ href: "#faq", label: tf("title") }] : []),
  ];

  return (
    <div className="min-h-screen bg-earth-50">
      <JsonLd data={lodgingLd} id="ld-lodging" />
      {faqLd && <JsonLd data={faqLd} id="ld-faq" />}
      <PageViewTracker homestayId={homestay.id} />
      <BookingHeader
        homestayName={homestay.name}
        logoUrl={homestay.logo_url}
        slug={homestay.slug}
        homestayId={homestay.id}
        bookHref={bookHref}
        bookingDisabled={!canBook}
        navItems={navItems}
      />
      {/* Fixed to the bottom on phones; this early in the page so screen readers meet it before the footer. */}
      <LandingBookBar bookHref={bookHref} fromPrice={fromPrice} bookingDisabled={!canBook} />

      <RespectReducedMotion>
      {/* Resets the counter that numbers each SectionMark. */}
      <main className="[counter-reset:landing-section]">
        <Breadcrumbs items={breadcrumbItems} visuallyHidden />
        <LandingHero
          name={homestay.name}
          tagline={homestay.tagline}
          heroImageUrl={homestay.hero_image_url}
          location={homestay.location}
          isVerified={homestay.host.is_verified}
          averageRating={averageRating}
          reviewCount={reviewCount}
          fromPrice={fromPrice}
          discoverHref={photos.length > 0 ? "#gallery" : "#about"}
          bookingDisabled={!canBook}
          cancellationDays={homestay.host.cancellation_days}
        />

        {/* What guests decide on comes first: photos, the place, its houses, reviews. Then host, map and the fine print. */}
        <GallerySection images={photos} name={homestay.name} />

        <AboutSection
          description={homestay.description}
          amenities={homestay.amenities}
          maxGuests={homestay.max_guests}
          prohibitions={homestay.prohibitions}
          amenityIcons={amenityIcons}
          prohibitionIcons={prohibitionIcons}
        />

        <LandingRooms rooms={landingRooms} bookHref={bookHref} bookingDisabled={!canBook} />

        {/* Results only: writing a review starts from the booking page's menu. */}
        {reviewCount > 0 && (
          <section id="reviews" className="bg-brand-50 scroll-mt-20 py-14 md:py-20 lg:py-28">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <SectionMark />
              <ReviewsDisplay
                reviews={reviews}
                averageRating={averageRating}
                totalCount={reviewCount}
                categoryAverages={categoryAverages}
                homestayId={homestay.id}
              />
            </div>
          </section>
        )}

        <HostLocationSection
          hostName={homestay.host.name}
          hostPhone={homestay.host.phone}
          lineId={homestay.line_id}
          hostAvatarUrl={homestay.host.avatar_url}
          isVerified={homestay.host.is_verified}
          hostCreatedAt={homestay.host.created_at}
          totalBookings={totalBookings}
          lastBookingDate={lastBookingDate}
          location={homestay.location}
          mapEmbedUrl={homestay.map_embed_url}
        />

        <CheckInInfoSection content={homestay.check_in_info} />
        <PoliciesSection content={homestay.policies} />
        <FaqSection items={homestay.faq} />

        <LandingCta bookHref={bookHref} bookingDisabled={!canBook} />
      </main>
      </RespectReducedMotion>

      <BookingFooter
        homestayName={homestay.name}
        logoUrl={homestay.logo_url}
        location={homestay.location}
        hostPhone={homestay.host.phone}
        socialLinks={{
          facebook_url: homestay.facebook_url,
          tiktok_url: homestay.tiktok_url,
          instagram_url: homestay.instagram_url,
          line_id: homestay.line_id,
        }}
      />
      {/* Room under the fixed Book bar at the very bottom, in the footer's color. */}
      <div aria-hidden className="h-[calc(5rem+env(safe-area-inset-bottom))] bg-earth-900 md:hidden" />
    </div>
  );
}
