"use client";

import { useState, useCallback } from "react";
import { Star, MessageSquare, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Review } from "@/types/database";
import { fmtDateStr } from "@/lib/format-date";

const PAGE_SIZE = 5;

interface ReviewsSectionProps {
  reviews: Review[];
  averageRating: number;
  totalCount: number;
  themeColor: string;
  homestayId: string;
}

function StarRating({ rating, size = 16, color }: { rating: number; size?: number; color: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className="shrink-0"
          style={{
            width: size,
            height: size,
            fill: star <= rating ? color : "transparent",
            color: star <= rating ? color : "#d1d5db",
          }}
        />
      ))}
    </div>
  );
}

export function ReviewsSection({
  reviews: initialReviews,
  averageRating,
  totalCount,
  themeColor,
  homestayId,
}: ReviewsSectionProps) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = reviews.length < totalCount;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const supabase = createClient();
    const from = reviews.length;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("homestay_id", homestayId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const rows = (data as unknown as Review[]) || [];
    setReviews((prev) => [...prev, ...rows]);
    setLoadingMore(false);
  }, [loadingMore, hasMore, reviews.length, homestayId]);

  return (
    <div className="space-y-4">
      {/* Header with average rating */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: themeColor + "15" }}
        >
          <Star className="h-4.5 w-4.5" style={{ color: themeColor }} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t("title")}</h3>
          {totalCount > 0 ? (
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(averageRating)} size={14} color={themeColor} />
              <span className="text-sm font-medium" style={{ color: themeColor }}>
                {averageRating}
              </span>
              <span className="text-sm text-gray-500">
                ({totalCount} {totalCount === 1 ? t("review") : t("reviewPlural")})
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("noReviews")}</p>
          )}
        </div>
      </div>

      {/* Review list */}
      {totalCount > 0 && (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {review.guest_name}
                </span>
                <StarRating rating={review.rating} size={13} color={themeColor} />
              </div>
              {review.comment && (
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {review.comment}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
              </p>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs text-gray-400">
                {t("showingCount", { count: reviews.length, total: totalCount })}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {t("loadingMore")}
                  </>
                ) : (
                  t("loadMore")
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-10 text-center">
          <MessageSquare className="h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">{t("noReviewsYet")}</p>
        </div>
      )}
    </div>
  );
}
