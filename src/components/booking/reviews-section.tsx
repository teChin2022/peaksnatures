"use client";

import { Star, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Review } from "@/types/database";

interface ReviewsSectionProps {
  reviews: Review[];
  averageRating: number;
  totalCount: number;
  themeColor: string;
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
  reviews,
  averageRating,
  totalCount,
  themeColor,
}: ReviewsSectionProps) {
  const t = useTranslations("reviews");

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
        <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
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
                {new Date(review.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          ))}
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
