import { createServiceRoleClient } from "@/lib/supabase/server";

export const REVIEWS_LIMIT = 100;
/** At or below this, a review is worth an admin's look. */
export const LOW_RATING = 2;

export interface AdminReview {
  id: string;
  created_at: string;
  guest_name: string;
  rating: number;
  comment: string | null;
  would_return: string | null;
  photo_count: number;
  homestay_name: string | null;
  host_id: string | null;
}

export interface ReviewSummary {
  reviews: AdminReview[];
  average: number | null;
  low: number;
}

/** Latest guest reviews across every homestay. Caller must have checked isAdmin. */
export async function getAdminReviews(): Promise<ReviewSummary> {
  const { data } = await createServiceRoleClient()
    .from("reviews")
    .select("id, created_at, guest_name, rating, comment, would_return, photos, homestay:homestays(name, host_id)")
    .order("created_at", { ascending: false })
    .limit(REVIEWS_LIMIT);

  type Row = Omit<AdminReview, "photo_count" | "homestay_name" | "host_id"> & {
    photos: string[] | null;
    homestay: { name: string; host_id: string } | null;
  };
  const reviews = ((data ?? []) as Row[]).map(({ photos, homestay, ...r }) => ({
    ...r,
    photo_count: photos?.length ?? 0,
    homestay_name: homestay?.name ?? null,
    host_id: homestay?.host_id ?? null,
  }));

  return {
    reviews,
    average: reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null,
    low: reviews.filter((r) => r.rating <= LOW_RATING).length,
  };
}
