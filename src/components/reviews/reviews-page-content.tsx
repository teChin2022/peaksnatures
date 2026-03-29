"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, ChevronLeft, ChevronRight, MessageSquare, Sparkles, ThumbsUp, Minus, ThumbsDown, Quote } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "@/components/reviews/star-rating";
import { ProvinceLabel } from "@/components/reviews/province-label";
import { getInitials } from "@/lib/utils";
import { fmtDateStr } from "@/lib/format-date";
import { RATING_CATEGORIES } from "@/lib/review-constants";
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

const TAG_I18N: Record<string, string> = {
  scenic_view: "tagScenicView",
  fresh_air: "tagFreshAir",
  peaceful: "tagPeaceful",
  delicious_food: "tagDeliciousFood",
  very_clean: "tagVeryClean",
  friendly: "tagFriendly",
  close_to_nature: "tagCloseToNature",
  good_value: "tagGoodValue",
  family_friendly: "tagFamilyFriendly",
  romantic: "tagRomantic",
  pet_friendly: "tagPetFriendly",
  good_wifi: "tagGoodWifi",
};

const WOULD_RETURN_CONFIG: Record<string, { icon: typeof ThumbsUp; color: string }> = {
  yes: { icon: ThumbsUp, color: "text-green-600" },
  maybe: { icon: Minus, color: "text-amber-500" },
  no: { icon: ThumbsDown, color: "text-gray-400" },
};

interface ReviewsPageContentProps {
  reviews: ReviewWithProvince[];
  averageRating: number;
  totalCount: number;
  filteredCount: number;
  ratingDistribution: Record<number, number>;
  categoryAverages: Record<string, number>;
  homestaySlug: string;
  currentPage: number;
  totalPages: number;
  currentSort: string;
  currentRatingFilter: string;
}

function RatingDistributionBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-6 items-center justify-end gap-0.5 text-sm text-gray-600">
        {stars}
        <Star className="h-3 w-3 shrink-0" style={{ fill: "#2F5D50", color: "#2F5D50" }} />
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#2F5D50] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-gray-500">{count}</span>
    </div>
  );
}

function ReviewCard({ review, locale, tr, tp }: { review: ReviewWithProvince; locale: string; tr: ReturnType<typeof useTranslations>; tp: ReturnType<typeof useTranslations> }) {
  const [expanded, setExpanded] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const needsClamp = !!review.comment && review.comment.length > 300;
  const province = review.bookings?.guest_province;
  const catRatings = [
    { key: "environment", val: review.rating_environment },
    { key: "cleanliness", val: review.rating_cleanliness },
    { key: "service", val: review.rating_service },
    { key: "value", val: review.rating_value },
  ].filter((c) => c.val != null);

  return (
    <>
      <div className="flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0 bg-[#2F5D50]/10 text-[#2F5D50]">
            <AvatarFallback className="bg-[#2F5D50]/10 text-[#2F5D50] text-sm font-medium">
              {getInitials(review.guest_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">{review.guest_name}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
              </span>
            </div>
            <ProvinceLabel province={province} locale={locale} />
          </div>
        </div>

        {/* Topic */}
        {review.topic && (
          <h4 className="mt-3 text-sm font-semibold text-gray-900">{review.topic}</h4>
        )}

        {/* Overall rating */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <StarRating rating={review.rating} size={14} />
        </div>

        {/* Category ratings */}
        {catRatings.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {catRatings.map((c) => (
              <div key={c.key} className="flex items-center gap-1 text-xs text-gray-500">
                <span>{tr(CATEGORY_I18N[c.key].label).split(" ")[0]}</span>
                <span className="font-medium text-gray-700">{c.val}</span>
                <Star className="h-2.5 w-2.5" style={{ fill: "#2F5D50", color: "#2F5D50" }} />
              </div>
            ))}
          </div>
        )}

        {/* Comment */}
        {review.comment && (
          <div className="mt-2.5">
            <p className={`text-sm leading-relaxed text-gray-600 whitespace-pre-wrap ${needsClamp && !expanded ? "line-clamp-4" : ""}`}>
              {review.comment}
            </p>
            {needsClamp && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-1 text-xs font-medium text-[#2F5D50] hover:underline"
              >
                {expanded ? tr("viewAll").replace("All", "Less") : tr("readMore")}
              </button>
            )}
          </div>
        )}

        {/* Photos */}
        {review.photos && review.photos.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {review.photos.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPhotoIndex(i)}
                className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-gray-100"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Tags */}
        {review.impression_tags && review.impression_tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {review.impression_tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-[#2F5D50]/5 px-2.5 py-1 text-xs font-medium text-[#2F5D50]">
                <Sparkles className="h-2.5 w-2.5" />
                {TAG_I18N[tag] ? tr(TAG_I18N[tag]) : tag}
              </span>
            ))}
          </div>
        )}

        {/* Bottom row: would return + highlight */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {review.would_return && WOULD_RETURN_CONFIG[review.would_return] && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${WOULD_RETURN_CONFIG[review.would_return].color}`}>
              {(() => { const Icon = WOULD_RETURN_CONFIG[review.would_return!].icon; return <Icon className="h-3.5 w-3.5" />; })()}
              {tp("wouldReturn")}: {tr(`wouldReturn${review.would_return.charAt(0).toUpperCase() + review.would_return.slice(1)}` as "wouldReturnYes")}
            </span>
          )}
          {review.stay_highlight && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 italic">
              <Quote className="h-3 w-3 shrink-0" />
              {review.stay_highlight}
            </span>
          )}
        </div>
      </div>

      {/* Photo lightbox */}
      {photoIndex !== null && review.photos && (
        <Dialog open={photoIndex !== null} onOpenChange={() => setPhotoIndex(null)}>
          <DialogContent className="sm:max-w-2xl p-2">
            <img
              src={review.photos[photoIndex]}
              alt=""
              className="w-full rounded-lg object-contain max-h-[80vh]"
            />
            <div className="flex justify-center gap-2 pt-1">
              {review.photos.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  className={`h-12 w-12 rounded-md overflow-hidden border-2 transition-colors ${i === photoIndex ? "border-[#2F5D50]" : "border-transparent"}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function ReviewsPageContent({
  reviews,
  averageRating,
  totalCount,
  filteredCount,
  ratingDistribution,
  categoryAverages,
  homestaySlug,
  currentPage,
  totalPages,
  currentSort,
  currentRatingFilter,
}: ReviewsPageContentProps) {
  const router = useRouter();
  const tr = useTranslations("reviews");
  const tp = useTranslations("reviewsPage");
  const locale = useLocale();

  const updateParams = (params: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [key, val] of Object.entries(params)) {
      if (val) url.searchParams.set(key, val);
      else url.searchParams.delete(key);
    }
    // Reset page when changing sort/filter
    if ("sort" in params || "rating" in params) {
      url.searchParams.delete("page");
    }
    router.push(url.pathname + url.search);
  };

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      {totalCount > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
            {/* Left: Overall rating */}
            <div className="flex flex-col items-center justify-center sm:min-w-[140px]">
              <span className="text-5xl font-bold text-gray-900">{averageRating}</span>
              <StarRating rating={Math.round(averageRating)} size={20} />
              <span className="mt-1 text-sm text-gray-500">
                {totalCount} {totalCount === 1 ? tr("review") : tr("reviewPlural")}
              </span>
            </div>

            {/* Right: Distribution bars */}
            <div className="flex-1 space-y-1.5">
              <h4 className="text-sm font-medium text-gray-700 mb-2">{tp("ratingDistribution")}</h4>
              {[5, 4, 3, 2, 1].map((stars) => (
                <RatingDistributionBar
                  key={stars}
                  stars={stars}
                  count={ratingDistribution[stars] || 0}
                  total={totalCount}
                />
              ))}
            </div>
          </div>

          {/* Category averages */}
          {Object.values(categoryAverages).some((v) => v > 0) && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">{tp("categoryAverages")}</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {RATING_CATEGORIES.map((cat) => {
                  const avg = categoryAverages[cat.key] || 0;
                  if (avg === 0) return null;
                  return (
                    <div key={cat.key} className="flex flex-col items-center rounded-xl bg-gray-50 p-3">
                      <span className="text-lg font-bold text-gray-900">{avg}</span>
                      <StarRating rating={Math.round(avg)} size={12} />
                      <span className="mt-1 text-center text-xs text-gray-500">
                        {tr(CATEGORY_I18N[cat.key].label)}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {tr(CATEGORY_I18N[cat.key].sub)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sort & Filter */}
      {totalCount > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => updateParams({ rating: "" })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                !currentRatingFilter
                  ? "bg-[#2F5D50] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tp("filterAll")}
            </button>
            {[5, 4, 3, 2, 1].map((stars) => (
              <button
                key={stars}
                onClick={() => updateParams({ rating: String(stars) })}
                className={`inline-flex items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  currentRatingFilter === String(stars)
                    ? "bg-[#2F5D50] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {stars}
                <Star className="h-3 w-3" style={{ fill: currentRatingFilter === String(stars) ? "white" : "#2F5D50", color: currentRatingFilter === String(stars) ? "white" : "#2F5D50" }} />
              </button>
            ))}
          </div>

          <Select value={currentSort} onValueChange={(val) => updateParams({ sort: val })}>
            <SelectTrigger className="w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{tp("sortNewest")}</SelectItem>
              <SelectItem value="highest">{tp("sortHighest")}</SelectItem>
              <SelectItem value="lowest">{tp("sortLowest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Reviews Grid */}
      {reviews.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} locale={locale} tr={tr} tp={tp} />
          ))}
        </div>
      ) : totalCount > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-12 text-center">
          <Star className="h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">{tp("noMatchingReviews")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => updateParams({ rating: "" })}
          >
            {tp("clearFilter")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-12 text-center">
          <MessageSquare className="h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">{tr("noReviewsYet")}</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => updateParams({ page: String(currentPage - 1) })}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {tp("previous")}
          </Button>
          <span className="text-sm text-gray-500">
            {tp("pageOf", { current: currentPage, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => updateParams({ page: String(currentPage + 1) })}
          >
            {tp("next")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
