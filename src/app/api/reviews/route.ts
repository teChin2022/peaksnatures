import { NextRequest, NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Review } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";
import { IMPRESSION_TAGS, WOULD_RETURN_OPTIONS } from "@/lib/review-constants";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const homestayId = searchParams.get("homestay_id");

  if (!homestayId) {
    return NextResponse.json({ reviews: [], averageRating: 0, totalCount: 0 });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const sort = searchParams.get("sort") || "newest";
  const ratingFilter = searchParams.get("rating");
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createServiceRoleClient();

  // Build the reviews query with sort and filter
  let reviewsQuery = supabase
    .from("reviews")
    .select("*, bookings(guest_province)", { count: "exact" })
    .eq("homestay_id", homestayId);

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

  // Parallel: fetch paginated reviews + all ratings for averages + distribution
  const [
    { data, count: filteredCount, error },
    { data: ratingRows, count: totalCount },
  ] = await Promise.all([
    reviewsQuery,
    supabase.from("reviews").select("rating, rating_environment, rating_cleanliness, rating_service, rating_value", { count: "exact" }).eq("homestay_id", homestayId),
  ]);

  if (error) {
    return NextResponse.json({ reviews: [], averageRating: 0, totalCount: 0 });
  }

  const reviews = (data as unknown as Review[]) || [];
  const allRatings = (ratingRows as { rating: number; rating_environment: number | null; rating_cleanliness: number | null; rating_service: number | null; rating_value: number | null }[]) || [];
  const count = totalCount || 0;

  // Overall average
  const averageRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length) * 10) / 10
      : 0;

  // Category averages (only from reviews that have category ratings)
  const categoryAverages = {
    environment: computeCategoryAvg(allRatings, "rating_environment"),
    cleanliness: computeCategoryAvg(allRatings, "rating_cleanliness"),
    service: computeCategoryAvg(allRatings, "rating_service"),
    value: computeCategoryAvg(allRatings, "rating_value"),
  };

  // Rating distribution
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of allRatings) {
    if (r.rating >= 1 && r.rating <= 5) {
      ratingDistribution[r.rating]++;
    }
  }

  return NextResponse.json(
    {
      reviews,
      averageRating,
      categoryAverages,
      ratingDistribution,
      totalCount: count,
      filteredCount: filteredCount || 0,
      page,
      limit,
    },
    {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    }
  );
}

function computeCategoryAvg(
  rows: { rating_environment: number | null; rating_cleanliness: number | null; rating_service: number | null; rating_value: number | null }[],
  key: "rating_environment" | "rating_cleanliness" | "rating_service" | "rating_value"
): number {
  const vals = rows.filter((r) => r[key] != null).map((r) => r[key] as number);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      booking_id,
      rating,
      guest_email,
      topic,
      comment,
      rating_environment,
      rating_cleanliness,
      rating_service,
      rating_value,
      photos,
      impression_tags,
      would_return,
      stay_highlight,
    } = body;

    // Validate mandatory fields
    if (
      !booking_id ||
      !guest_email ||
      !comment?.trim() ||
      !rating || rating < 1 || rating > 5 ||
      !rating_environment || rating_environment < 1 || rating_environment > 5 ||
      !rating_cleanliness || rating_cleanliness < 1 || rating_cleanliness > 5 ||
      !rating_service || rating_service < 1 || rating_service > 5 ||
      !rating_value || rating_value < 1 || rating_value > 5
    ) {
      return NextResponse.json(
        { error: "All mandatory fields are required: booking_id, guest_email, comment, rating (1-5), and all category ratings (1-5)" },
        { status: 400 }
      );
    }

    // Validate optional fields
    if (photos && (!Array.isArray(photos) || photos.length > 5)) {
      return NextResponse.json({ error: "Photos must be an array of up to 5 URLs" }, { status: 400 });
    }

    if (impression_tags && Array.isArray(impression_tags)) {
      const validTags = impression_tags.filter((t: string) => (IMPRESSION_TAGS as readonly string[]).includes(t));
      if (validTags.length !== impression_tags.length) {
        return NextResponse.json({ error: "Invalid impression tags" }, { status: 400 });
      }
    }

    if (would_return && !(WOULD_RETURN_OPTIONS as readonly string[]).includes(would_return)) {
      return NextResponse.json({ error: "would_return must be yes, maybe, or no" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 1. Verify the booking exists and is completed
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, homestay_id, guest_name, guest_email, status, check_out")
      .eq("id", booking_id)
      .single();

    const booking = bookingRow as unknown as { id: string; homestay_id: string; guest_name: string; guest_email: string; status: string; check_out: string } | null;

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Verify the reviewer is the actual guest
    if (booking.guest_email.toLowerCase() !== (guest_email as string).toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match the booking" },
        { status: 403 }
      );
    }

    if (booking.status !== "completed") {
      return NextResponse.json(
        { error: "BOOKING_NOT_COMPLETED", message: "Only completed bookings can be reviewed" },
        { status: 400 }
      );
    }

    // 2. Check if a review already exists for this booking
    const { data: existingReviewRow } = await supabase
      .from("reviews")
      .select("id")
      .eq("booking_id", booking_id)
      .single();

    const existingReview = existingReviewRow as unknown as { id: string } | null;

    if (existingReview) {
      return NextResponse.json(
        { error: "ALREADY_REVIEWED", message: "This booking has already been reviewed" },
        { status: 409 }
      );
    }

    // 3. Insert the review
    const { data: reviewRow, error: insertError } = await (supabase
      .from("reviews") as ReturnType<typeof supabase.from>)
      .insert({
        homestay_id: booking.homestay_id,
        booking_id: booking_id,
        guest_name: booking.guest_name,
        topic: topic?.trim() || null,
        rating: Math.round(rating),
        rating_environment: Math.round(rating_environment),
        rating_cleanliness: Math.round(rating_cleanliness),
        rating_service: Math.round(rating_service),
        rating_value: Math.round(rating_value),
        comment: comment.trim(),
        photos: photos || [],
        impression_tags: impression_tags || [],
        would_return: would_return || null,
        stay_highlight: stay_highlight?.trim() || null,
        created_by: booking.guest_name,
      })
      .select()
      .single();

    const review = reviewRow as unknown as Review | null;

    if (insertError) {
      console.error("[Reviews] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to submit review" },
        { status: 500 }
      );
    }

    // Log in background
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "review",
        entityId: review?.id || booking_id,
        eventType: EventType.REVIEW_SUBMITTED,
        actorType: "guest",
        actorId: null,
        data: { booking_id, rating: Math.round(rating), guest_name: booking.guest_name },
        req: request,
      });
    });

    return NextResponse.json({ review });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
