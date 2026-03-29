import Link from "next/link";
import { Star, MessageSquare, ArrowRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { StarRating } from "@/components/reviews/star-rating";
import { ProvinceLabel } from "@/components/reviews/province-label";
import { RATING_CATEGORIES } from "@/lib/review-constants";
import { fmtDateStr } from "@/lib/format-date";
import type { Review } from "@/types/database";

type ReviewWithProvince = Review & {
  bookings: { guest_province: string | null } | null;
};

const CATEGORY_I18N: Record<string, { label: string; sub: string }> = {
  environment: { label: "categoryEnvironment", sub: "categoryEnvironmentSub" },
  cleanliness: { label: "categoryCleanliness", sub: "categoryCleanlinessSub" },
  service: { label: "categoryService", sub: "categoryServiceSub" },
  value: { label: "categoryValue", sub: "categoryValueSub" },
};

interface ReviewsPreviewProps {
  reviews: ReviewWithProvince[];
  averageRating: number;
  totalCount: number;
  categoryAverages: Record<string, number>;
  homestaySlug: string;
}

export async function ReviewsPreview({
  reviews,
  averageRating,
  totalCount,
  categoryAverages,
  homestaySlug,
}: ReviewsPreviewProps) {
  const t = await getTranslations("reviews");
  const locale = await getLocale();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
            <Star className="h-4.5 w-4.5 text-gray-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("title")}</h3>
            {totalCount > 0 ? (
              <div className="flex items-center gap-2">
                <StarRating rating={Math.round(averageRating)} size={14} />
                <span className="text-sm font-medium text-gray-900">{averageRating}</span>
                <span className="text-sm text-gray-500">
                  ({totalCount} {totalCount === 1 ? t("review") : t("reviewPlural")})
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t("noReviews")}</p>
            )}
          </div>
        </div>
        {totalCount > 0 && (
          <Link
            href={`/${homestaySlug}/reviews`}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#2F5D50] transition-colors hover:text-[#264A40]"
          >
            {t("seeAllReviews", { count: totalCount })}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Category averages (compact) */}
      {totalCount > 0 && Object.values(categoryAverages).some((v) => v > 0) && (
        <div className="flex flex-wrap gap-3">
          {RATING_CATEGORIES.map((cat) => {
            const avg = categoryAverages[cat.key] || 0;
            if (avg === 0) return null;
            return (
              <div key={cat.key} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5">
                <span className="text-sm font-semibold text-gray-900">{avg}</span>
                <Star className="h-3 w-3" style={{ fill: "#2F5D50", color: "#2F5D50" }} />
                <span className="text-xs text-gray-500">{t(CATEGORY_I18N[cat.key].label)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Review cards */}
      {totalCount > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <div key={review.id} className="flex flex-col rounded-xl bg-white p-4 shadow-sm h-full">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">{review.guest_name}</span>
                  <ProvinceLabel province={review.bookings?.guest_province} locale={locale} />
                </div>
                <StarRating rating={review.rating} size={13} />
              </div>
              {review.topic && (
                <p className="mt-1.5 text-sm font-semibold text-gray-900">{review.topic}</p>
              )}
              <p className="mt-1.5 min-h-[3rem] text-sm leading-relaxed text-gray-600 line-clamp-3">
                {review.comment || ""}
              </p>
              {review.impression_tags && review.impression_tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {review.impression_tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-[#2F5D50]/5 px-2 py-0.5 text-[10px] font-medium text-[#2F5D50]">
                      {t(`tag${tag.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")}` as "tagScenicView")}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-auto pt-2 text-xs text-gray-400">
                {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
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
