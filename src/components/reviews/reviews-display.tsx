"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Star, MessageSquare, Loader2, Sparkles, ThumbsUp, Minus, ThumbsDown, Quote, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useSwipe } from "@/hooks/use-swipe";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRating } from "@/components/reviews/star-rating";
import { SectionHeading } from "@/components/booking/section-mark";
import { ProvinceLabel } from "@/components/reviews/province-label";
import { fmtDateStr } from "@/lib/format-date";
// import { RATING_CATEGORIES } from "@/lib/review-constants";
import type { Review } from "@/types/database";

type ReviewWithProvince = Review & {
  bookings: { guest_province: string | null } | null;
};

const GRID_LIMIT = 6;
const MODAL_PAGE_SIZE = 20;

const CATEGORY_I18N: Record<string, { label: string; sub: string }> = {
  environment: { label: "categoryEnvironment", sub: "categoryEnvironmentSub" },
  cleanliness: { label: "categoryCleanliness", sub: "categoryCleanlinessSub" },
  service: { label: "categoryService", sub: "categoryServiceSub" },
  value: { label: "categoryValue", sub: "categoryValueSub" },
};

const TAG_I18N: Record<string, string> = {
  scenic_view: "tagScenicView", fresh_air: "tagFreshAir", peaceful: "tagPeaceful",
  delicious_food: "tagDeliciousFood", very_clean: "tagVeryClean", friendly: "tagFriendly",
  close_to_nature: "tagCloseToNature", good_value: "tagGoodValue", family_friendly: "tagFamilyFriendly",
  romantic: "tagRomantic", good_wifi: "tagGoodWifi",
};

const WOULD_RETURN_CONFIG: Record<string, { icon: typeof ThumbsUp; color: string; label: string }> = {
  yes: { icon: ThumbsUp, color: "text-brand", label: "wouldReturnYes" },
  maybe: { icon: Minus, color: "text-earth-600", label: "wouldReturnMaybe" },
  no: { icon: ThumbsDown, color: "text-earth-600", label: "wouldReturnNo" },
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function RatingBar({ value, label }: { value: number; label: string }) {
  const pct = value > 0 ? (value / 5) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs text-earth-600" title={label}>{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-100">
        {pct > 0 && (
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-4 text-right text-xs font-medium text-earth-600">{value}</span>
    </div>
  );
}

interface ReviewsDisplayProps {
  reviews: ReviewWithProvince[];
  averageRating: number;
  totalCount: number;
  categoryAverages: Record<string, number>;
  homestayId: string;
}

/** A Radix dialog of its own, so it layers over the review dialog it can be opened from. */
function PhotoLightbox({
  photos,
  index,
  onClose,
}: {
  photos: string[];
  index: number;
  onClose: () => void;
}) {
  const t = useTranslations("reviews");
  const tr = useTranslations("rooms");
  const tc = useTranslations("common");
  const [current, setCurrent] = useState(index);
  const prev = useCallback(() => setCurrent((i) => (i > 0 ? i - 1 : photos.length - 1)), [photos.length]);
  const next = useCallback(() => setCurrent((i) => (i < photos.length - 1 ? i + 1 : 0)), [photos.length]);

  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useSwipe(el, { onSwipeLeft: next, onSwipeRight: prev });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={setEl}
        showCloseButton={false}
        aria-describedby={undefined}
        overlayClassName="bg-black/70 backdrop-blur-2xl"
        className="inset-0 top-0 left-0 flex h-full w-full max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-0 bg-transparent p-4 shadow-none sm:max-w-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") prev();
          if (e.key === "ArrowRight") next();
        }}
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <Button
          variant="ghost"
          size="icon"
          aria-label={tc("close")}
          className="absolute right-4 top-4 z-10 size-11 rounded-full text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>

        {photos.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={tr("prevPhoto")}
            className="absolute left-2 z-10 size-11 rounded-full text-white hover:bg-white/20 sm:left-4"
            onClick={prev}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}

        <div className="flex h-[80svh] w-[90vw] max-w-4xl items-center justify-center">
          <img
            key={photos[current]}
            src={photos[current]}
            alt={`Guest review photo ${current + 1} of ${photos.length}`}
            className="max-h-[80svh] max-w-full h-auto w-auto rounded-2xl object-contain"
          />
        </div>

        {photos.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tr("nextPhoto")}
              className="absolute right-2 z-10 size-11 rounded-full text-white hover:bg-white/20 sm:right-4"
              onClick={next}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>

            <div className="absolute bottom-6 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm">
              {current + 1} / {photos.length}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Avatar, name, where from and when, and the overall score. */
function ReviewHeader({ review, locale }: { review: ReviewWithProvince; locale: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-earth-100 text-xs font-bold text-earth-700">
        {getInitials(review.guest_name)}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-earth-900 truncate block">{review.guest_name}</span>
        {/* Wraps as whole pieces: in the phone swipe row a long province pushed the date onto three lines. */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5">
          <ProvinceLabel province={review.bookings?.guest_province} locale={locale} />
          <span className="whitespace-nowrap text-xs text-earth-600">
            {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 shrink-0">
        <Star className="h-3 w-3" style={{ fill: "white", color: "white" }} />
        <span className="text-xs font-bold text-white">{review.rating}</span>
      </div>
    </div>
  );
}

/** Impression tags and the stay highlight, when the guest picked any. */
function ReviewExtras({ review, t }: { review: ReviewWithProvince; t: ReturnType<typeof useTranslations> }) {
  return (
    <>
      {review.impression_tags && review.impression_tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {review.impression_tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-brand/10 bg-brand/5 px-2 py-0.5 text-xs font-medium text-brand">
              <Sparkles className="h-3 w-3" />
              {TAG_I18N[tag] ? t(TAG_I18N[tag]) : tag}
            </span>
          ))}
        </div>
      )}

      {/* No italic: most highlights are Thai, which has no italic face. */}
      {review.stay_highlight && (
        <div className="mt-2.5 rounded-lg bg-earth-100 px-3 py-2">
          <span className="inline-flex items-start gap-1.5 text-sm text-earth-700 leading-relaxed">
            <Quote className="mt-1 h-3 w-3 shrink-0 text-earth-500" />
            {review.stay_highlight}
          </span>
        </div>
      )}
    </>
  );
}

/** Only what the guest filled in: the categories they rated, and their would-return answer. */
function ReviewRatings({ review, t }: { review: ReviewWithProvince; t: ReturnType<typeof useTranslations> }) {
  const rated = [
    { key: "environment", val: review.rating_environment },
    { key: "cleanliness", val: review.rating_cleanliness },
    { key: "service", val: review.rating_service },
    { key: "value", val: review.rating_value },
  ].filter((c): c is { key: string; val: number } => c.val != null);
  const wouldReturn = review.would_return ? WOULD_RETURN_CONFIG[review.would_return] : undefined;
  if (rated.length === 0 && !wouldReturn) return null;
  const Icon = wouldReturn?.icon;

  return (
    <>
      <div className="my-3 h-px bg-earth-200" />
      {rated.length > 0 && (
        <div className="space-y-1.5">
          {rated.map((c) => (
            <RatingBar key={c.key} value={c.val} label={t(CATEGORY_I18N[c.key].label)} />
          ))}
        </div>
      )}
      {wouldReturn && Icon && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-earth-600">{t("wouldReturnDisplay")}</span>
          <span className={`inline-flex items-center gap-1 font-medium ${wouldReturn.color}`}>
            <Icon className="h-3 w-3" />
            {t(wouldReturn.label as "wouldReturnYes")}
          </span>
        </div>
      )}
    </>
  );
}

function ReviewCard({
  review,
  locale,
  t,
  onReadMore,
  onPhotoClick,
}: {
  review: ReviewWithProvince;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  onReadMore: (review: ReviewWithProvince) => void;
  onPhotoClick: (photos: string[], index: number) => void;
}) {
  // Measured, not counted: how much of a comment three lines hold depends on the script and the card's width.
  const commentRef = useRef<HTMLParagraphElement>(null);
  const [commentCut, setCommentCut] = useState(false);
  useEffect(() => {
    const el = commentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCommentCut(el.scrollHeight > el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [review.comment]);

  return (
    <div className="flex flex-col rounded-2xl border border-earth-100 bg-white p-5 h-full">
      <ReviewHeader review={review} locale={locale} />

      {/* The guest's words first; the scores support them. */}
      {review.comment && (
        <p ref={commentRef} className="mt-3 text-sm leading-relaxed text-earth-600 line-clamp-3">
          {review.comment}
        </p>
      )}

      {/* Photos */}
      {review.photos && review.photos.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {review.photos.map((url, i) => (
            <button key={i} type="button" onClick={() => onPhotoClick(review.photos!, i)} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-earth-100 transition-transform hover:scale-105 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
              <img src={url} alt={`Photo ${i + 1} from ${review.guest_name}'s review`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <ReviewExtras review={review} t={t} />
      <ReviewRatings review={review} t={t} />

      {/* Read more */}
      {commentCut && (
        <div className="mt-auto pt-1">
          <button type="button" onClick={() => onReadMore(review)} className="inline-flex min-h-11 items-center rounded-sm text-xs font-medium text-brand hover:text-brand-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
            {t("readMore")} &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

function ModalReviewCard({ review, locale, t, onPhotoClick }: { review: ReviewWithProvince; locale: string; t: ReturnType<typeof useTranslations>; onPhotoClick: (photos: string[], index: number) => void }) {
  return (
    <div className="rounded-2xl border border-earth-100 bg-white p-5">
      <ReviewHeader review={review} locale={locale} />

      {/* Comment — full text */}
      {review.comment && (
        <p className="mt-3 text-sm leading-relaxed text-earth-600 whitespace-pre-wrap">{review.comment}</p>
      )}

      {/* Photos — larger */}
      {review.photos && review.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((url, i) => (
            <button key={i} type="button" onClick={() => onPhotoClick(review.photos!, i)} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-earth-100 transition-transform hover:scale-105 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
              <img src={url} alt={`Photo ${i + 1} from ${review.guest_name}'s review`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <ReviewExtras review={review} t={t} />
      <ReviewRatings review={review} t={t} />
    </div>
  );
}

export function ReviewsDisplay({
  reviews: initialReviews,
  averageRating,
  totalCount,
  categoryAverages: _categoryAverages,
  homestayId,
}: ReviewsDisplayProps) {
  const t = useTranslations("reviews");
  const locale = useLocale();

  const [selectedReview, setSelectedReview] = useState<ReviewWithProvince | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReviews, setModalReviews] = useState<ReviewWithProvince[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTotal, setModalTotal] = useState(totalCount);
  const modalOffsetRef = useRef(0);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);

  const openLightbox = useCallback((photos: string[], index: number) => {
    setLightbox({ photos, index });
  }, []);

  const gridReviews = initialReviews.slice(0, GRID_LIMIT);
  const hasMore = totalCount > GRID_LIMIT;
  const hasMoreInModal = modalReviews.length < modalTotal;

  const fetchMoreModal = useCallback(async (reset: boolean) => {
    setModalLoading(true);
    const from = reset ? 0 : modalOffsetRef.current;
    try {
      // The server route reads each guest's province; the browser client can't (RLS on bookings).
      const res = await fetch(
        `/api/reviews?homestay_id=${encodeURIComponent(homestayId)}&page=${Math.floor(from / MODAL_PAGE_SIZE) + 1}&limit=${MODAL_PAGE_SIZE}`,
      );
      const body: { reviews?: ReviewWithProvince[]; totalCount?: number } = res.ok ? await res.json() : {};
      const rows = body.reviews ?? [];
      if (reset) setModalReviews(rows);
      else setModalReviews((prev) => [...prev, ...rows]);
      modalOffsetRef.current = from + rows.length;
      if (typeof body.totalCount === "number") setModalTotal(body.totalCount);
    } catch {
      // Offline or the route failed: keep what the modal already shows; "load more" stays usable.
    } finally {
      setModalLoading(false);
    }
  }, [homestayId]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    modalOffsetRef.current = 0;
    fetchMoreModal(true);
  }, [fetchMoreModal]);

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <SectionHeading>{t("title")}</SectionHeading>
          {totalCount > 0 ? (
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(averageRating)} size={14} />
              <span className="text-sm font-medium text-earth-900">{averageRating}</span>
              <span className="text-sm text-earth-600">
                ({totalCount} {totalCount === 1 ? t("review") : t("reviewPlural")})
              </span>
            </div>
          ) : (
            <p className="text-sm text-earth-600">{t("noReviews")}</p>
          )}
        </div>

        {/* Category averages */}
        {/* {totalCount > 0 && Object.values(categoryAverages).some((v) => v > 0) && (
          <div className="flex flex-wrap gap-3">
            {RATING_CATEGORIES.map((cat) => {
              const avg = categoryAverages[cat.key] || 0;
              if (avg === 0) return null;
              return (
                <div key={cat.key} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5">
                  <span className="text-sm font-semibold text-earth-900">{avg}</span>
                  <Star className="h-3 w-3" style={{ fill: "#2F5D50", color: "#2F5D50" }} />
                  <span className="text-xs text-earth-500">{t(CATEGORY_I18N[cat.key].label)}</span>
                </div>
              );
            })}
          </div>
        )} */}

        {/* Phones: one card wide with the next one peeking, swiped sideways. The grid from sm up. */}
        {totalCount > 0 && (
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
            {gridReviews.map((review) => (
              <div key={review.id} className="w-[85%] shrink-0 snap-start sm:w-auto">
                <ReviewCard review={review} locale={locale} t={t} onReadMore={setSelectedReview} onPhotoClick={openLightbox} />
              </div>
            ))}
          </div>
        )}

        {/* Under the cards, full width on phones: beside the heading it squeezed the title. */}
        {hasMore && (
          <div className="text-center">
            <Button variant="outline" className="h-11 w-full rounded-full border-earth-200 text-earth-800 shadow-none sm:w-auto focus-visible:border-earth-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2" onClick={openModal}>
              {t("seeAllReviews", { count: totalCount })}
            </Button>
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-earth-200 bg-earth-50/50 py-10 text-center">
            <MessageSquare className="h-8 w-8 text-earth-300" />
            <p className="mt-2 text-sm text-earth-400">{t("noReviewsYet")}</p>
          </div>
        )}
      </div>

      {/* View All Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85svh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-earth-600" />
              {t("viewAllTitle")}
              <span className="text-sm font-normal text-earth-600">
                ({modalTotal} {modalTotal === 1 ? t("review") : t("reviewPlural")})
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            {modalReviews.length === 0 && modalLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-earth-400" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {modalReviews.map((review) => (
                    <ModalReviewCard key={review.id} review={review} locale={locale} t={t} onPhotoClick={openLightbox} />
                  ))}
                </div>
                <div className="flex flex-col items-center gap-2 pt-4">
                  <p className="text-xs text-earth-600">
                    {t("showingCount", { count: modalReviews.length, total: modalTotal })}
                  </p>
                  {hasMoreInModal && (
                    <Button variant="outline" size="sm" disabled={modalLoading} onClick={() => fetchMoreModal(false)}>
                      {modalLoading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("loadingMore")}</>
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
        {/* svh scroll cap: a long review with photos ran past the bottom of a phone screen. */}
        <DialogContent className="sm:max-w-md max-h-[85svh] overflow-y-auto" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{selectedReview?.guest_name}</DialogTitle>
          {selectedReview && (
            <ModalReviewCard review={selectedReview} locale={locale} t={t} onPhotoClick={openLightbox} />
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox */}
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
