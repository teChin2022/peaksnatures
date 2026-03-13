"use client";

import { useState, useCallback, useRef } from "react";
import { Star, MessageSquare, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { Review } from "@/types/database";
import { fmtDateStr } from "@/lib/format-date";

const GRID_LIMIT = 9;
const MODAL_PAGE_SIZE = 20;

interface ReviewsSectionProps {
  reviews: Review[];
  averageRating: number;
  totalCount: number;
  homestayId: string;
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className="shrink-0"
          style={{
            width: size,
            height: size,
            fill: star <= rating ? "#374151" : "transparent",
            color: star <= rating ? "#374151" : "#d1d5db",
          }}
        />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  locale,
  onReadMore,
  readMoreLabel,
}: {
  review: Review;
  locale: string;
  onReadMore: (review: Review) => void;
  readMoreLabel: string;
}) {
  const needsClamp = !!review.comment && review.comment.length > 150;
  return (
    <div className="flex flex-col rounded-xl bg-white p-4 shadow-sm h-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">
          {review.guest_name}
        </span>
        <StarRating rating={review.rating} size={13} />
      </div>
      <p className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-gray-600 line-clamp-3">
        {review.comment || ""}
      </p>
      <div className="mt-auto pt-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
        </p>
        {needsClamp && (
          <button
            type="button"
            onClick={() => onReadMore(review)}
            className="text-xs font-medium text-gray-900 hover:text-black transition-colors"
          >
            {readMoreLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function ReviewsSection({
  reviews: initialReviews,
  averageRating,
  totalCount,
  homestayId,
}: ReviewsSectionProps) {
  const t = useTranslations("reviews");
  const locale = useLocale();

  // Read More modal state
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  // View All modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReviews, setModalReviews] = useState<Review[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTotal, setModalTotal] = useState(totalCount);
  const modalOffsetRef = useRef(0);

  const gridReviews = initialReviews.slice(0, GRID_LIMIT);
  const hasMore = totalCount > GRID_LIMIT;
  const hasMoreInModal = modalReviews.length < modalTotal;

  const fetchMoreModal = useCallback(async (reset: boolean) => {
    setModalLoading(true);
    const supabase = createClient();
    const from = reset ? 0 : modalOffsetRef.current;
    const to = from + MODAL_PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from("reviews")
      .select("*", { count: "exact" })
      .eq("homestay_id", homestayId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const rows = (data as unknown as Review[]) || [];
    if (reset) {
      setModalReviews(rows);
    } else {
      setModalReviews((prev) => [...prev, ...rows]);
    }
    modalOffsetRef.current = (reset ? 0 : modalOffsetRef.current) + rows.length;
    if (count !== null) setModalTotal(count);
    setModalLoading(false);
  }, [homestayId]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    modalOffsetRef.current = 0;
    fetchMoreModal(true);
  }, [fetchMoreModal]);

  return (
    <>
      <div className="space-y-4">
        {/* Header with average rating */}
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
                  <span className="text-sm font-medium text-gray-900">
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
          {hasMore && (
            <Button variant="outline" size="sm" onClick={openModal}>
              {t("viewAll")}
            </Button>
          )}
        </div>

        {/* Review grid — max 6 */}
        {totalCount > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridReviews.map((review) => (
              <ReviewCard key={review.id} review={review} locale={locale} onReadMore={setSelectedReview} readMoreLabel={t("readMore")} />
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

      {/* View All Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-gray-600" />
              {t("viewAllTitle")}
              <span className="text-sm font-normal text-gray-500">
                ({modalTotal} {modalTotal === 1 ? t("review") : t("reviewPlural")})
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            {modalReviews.length === 0 && modalLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {modalReviews.map((review) => (
                    <div key={review.id} className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {review.guest_name}
                        </span>
                        <StarRating rating={review.rating} size={13} />
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
                </div>

                {/* Load More / Count */}
                <div className="flex flex-col items-center gap-2 pt-4">
                  <p className="text-xs text-gray-500">
                    {t("showingCount", {
                      count: modalReviews.length,
                      total: modalTotal,
                    })}
                  </p>
                  {hasMoreInModal && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={modalLoading}
                      onClick={() => fetchMoreModal(false)}
                    >
                      {modalLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("loadingMore")}
                        </>
                      ) : (
                        t("loadMore")
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Read More — single review detail */}
      <Dialog open={!!selectedReview} onOpenChange={(o) => { if (!o) setSelectedReview(null); }}>
        <DialogContent className="sm:max-w-md">
          {selectedReview && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{selectedReview.guest_name}</span>
                  <StarRating rating={selectedReview.rating} size={16} />
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                {selectedReview.comment}
              </p>
              <p className="text-xs text-gray-400">
                {fmtDateStr(selectedReview.created_at.split("T")[0], "d MMM yyyy", locale)}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
