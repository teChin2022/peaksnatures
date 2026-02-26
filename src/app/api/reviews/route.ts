import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Review } from "@/types/database";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const homestayId = searchParams.get("homestay_id");

  if (!homestayId) {
    return NextResponse.json({ reviews: [], averageRating: 0, totalCount: 0 });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createServiceRoleClient();

  // Parallel: fetch paginated reviews + total count + all ratings for average
  const [
    { data, error },
    { count: totalCount },
    { data: ratingRows },
  ] = await Promise.all([
    supabase.from("reviews").select("*").eq("homestay_id", homestayId).order("created_at", { ascending: false }).range(from, to),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId),
    supabase.from("reviews").select("rating").eq("homestay_id", homestayId),
  ]);

  if (error) {
    return NextResponse.json({ reviews: [], averageRating: 0, totalCount: 0 });
  }

  const reviews = (data as unknown as Review[]) || [];
  const allRatings = (ratingRows as { rating: number }[]) || [];
  const count = totalCount || 0;
  const averageRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length) * 10) / 10
      : 0;

  return NextResponse.json({ reviews, averageRating, totalCount: count, page, limit });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { booking_id, rating, comment, guest_email } = body;

    if (!booking_id || !rating || rating < 1 || rating > 5 || !guest_email) {
      return NextResponse.json(
        { error: "booking_id, guest_email, and rating (1-5) are required" },
        { status: 400 }
      );
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
        rating: Math.round(rating),
        comment: comment?.trim() || null,
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

    return NextResponse.json({ review });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
