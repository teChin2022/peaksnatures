import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { BookingFooter } from "@/components/booking/booking-footer";
import { ReviewsPageContent } from "@/components/reviews/reviews-page-content";
import { REVIEWS_PER_PAGE } from "@/lib/review-constants";
import type { Homestay, Review } from "@/types/database";

export const revalidate = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; rating?: string; page?: string }>;
}

type ReviewWithProvince = Review & {
  bookings: { guest_province: string | null } | null;
};

const getReviewsPageData = cache(async function getReviewsPageData(
  slug: string,
  sort: string,
  ratingFilter: string | undefined,
  page: number
) {
  const supabase = createServiceRoleClient();

  // Fetch homestay basic info
  const { data: homestayRow } = await supabase
    .from("homestays")
    .select("id, name, slug, location, logo_url, hero_image_url, host_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!homestayRow) return null;

  const homestay = homestayRow as unknown as Pick<Homestay, "id" | "name" | "slug" | "location" | "logo_url" | "hero_image_url" | "host_id">;

  // Fetch host info for footer
  const hostPromise = supabase.from("hosts").select("name").eq("id", homestay.host_id).single();

  // Build paginated reviews query
  const from = (page - 1) * REVIEWS_PER_PAGE;
  const to = from + REVIEWS_PER_PAGE - 1;

  let reviewsQuery = supabase
    .from("reviews")
    .select("*, bookings(guest_province)", { count: "exact" })
    .eq("homestay_id", homestay.id);

  if (ratingFilter && !isNaN(Number(ratingFilter))) {
    reviewsQuery = reviewsQuery.eq("rating", Number(ratingFilter));
  }

  if (sort === "highest") {
    reviewsQuery = reviewsQuery.order("rating", { ascending: false }).order("created_at", { ascending: false });
  } else if (sort === "lowest") {
    reviewsQuery = reviewsQuery.order("rating", { ascending: true }).order("created_at", { ascending: false });
  } else {
    reviewsQuery = reviewsQuery.order("created_at", { ascending: false });
  }

  reviewsQuery = reviewsQuery.range(from, to);

  // All ratings for averages + distribution (always unfiltered)
  const allRatingsPromise = supabase
    .from("reviews")
    .select("rating, rating_environment, rating_cleanliness, rating_service, rating_value", { count: "exact" })
    .eq("homestay_id", homestay.id);

  const [
    { data: reviewRows, count: filteredCount },
    { data: allRatingRows, count: totalCount },
    { data: hostRow },
  ] = await Promise.all([reviewsQuery, allRatingsPromise, hostPromise]);

  const reviews = (reviewRows as unknown as ReviewWithProvince[]) || [];
  const allRatings = (allRatingRows as { rating: number; rating_environment: number | null; rating_cleanliness: number | null; rating_service: number | null; rating_value: number | null }[]) || [];
  const hostName = (hostRow as unknown as { name: string } | null)?.name || "";

  // Compute averages
  const averageRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length) * 10) / 10
      : 0;

  const computeAvg = (key: "rating_environment" | "rating_cleanliness" | "rating_service" | "rating_value") => {
    const vals = allRatings.filter((r) => r[key] != null).map((r) => r[key] as number);
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };

  const categoryAverages = {
    environment: computeAvg("rating_environment"),
    cleanliness: computeAvg("rating_cleanliness"),
    service: computeAvg("rating_service"),
    value: computeAvg("rating_value"),
  };

  // Distribution
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of allRatings) {
    if (r.rating >= 1 && r.rating <= 5) ratingDistribution[r.rating]++;
  }

  return {
    homestay,
    hostName,
    reviews,
    averageRating,
    categoryAverages,
    ratingDistribution,
    totalCount: totalCount || 0,
    filteredCount: filteredCount || 0,
  };
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  await searchParams;
  const data = await getReviewsPageData(slug, "newest", undefined, 1);

  if (!data) {
    return { title: "Not Found — Peaksnature" };
  }

  const { homestay, averageRating, totalCount } = data;
  return {
    title: `Reviews — ${homestay.name} | Peaksnature`,
    description: `Read ${totalCount} guest reviews for ${homestay.name} in ${homestay.location}. Average rating: ${averageRating}/5.`,
    openGraph: {
      title: `${homestay.name} — Guest Reviews`,
      description: `${totalCount} reviews, ${averageRating}/5 average rating`,
      images: homestay.hero_image_url ? [{ url: homestay.hero_image_url }] : [],
    },
  };
}

export default async function ReviewsPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const sort = sp.sort || "newest";
  const ratingFilter = sp.rating;
  const page = Math.max(1, parseInt(sp.page || "1", 10));

  const data = await getReviewsPageData(slug, sort, ratingFilter, page);

  if (!data) {
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) {
      permanentRedirect(`/${newSlug}/reviews`);
    }
    notFound();
  }

  const { homestay, hostName, reviews, averageRating, categoryAverages, ratingDistribution, totalCount, filteredCount } = data;
  const tp = await getTranslations("reviewsPage");

  const effectiveCount = ratingFilter ? filteredCount : totalCount;
  const totalPages = Math.max(1, Math.ceil(effectiveCount / REVIEWS_PER_PAGE));

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link
            href={`/${homestay.slug}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{tp("backToHomestay", { name: homestay.name })}</span>
          </Link>
          <div className="ml-auto text-sm font-medium text-gray-900">{tp("title")}</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <ReviewsPageContent
          reviews={reviews}
          averageRating={averageRating}
          totalCount={totalCount}
          filteredCount={effectiveCount}
          ratingDistribution={ratingDistribution}
          categoryAverages={categoryAverages}
          homestaySlug={homestay.slug}
          currentPage={page}
          totalPages={totalPages}
          currentSort={sort}
          currentRatingFilter={ratingFilter || ""}
        />
      </main>

      <BookingFooter
        homestayName={homestay.name}
        logoUrl={homestay.logo_url}
        location={homestay.location}
        hostName={hostName}
      />
    </div>
  );
}
