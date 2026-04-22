"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { Star, MessageSquare, Loader2, Sparkles, ThumbsUp, Minus, ThumbsDown, Quote, PenLine, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useSwipe } from "@/hooks/use-swipe";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { StarRating } from "@/components/reviews/star-rating";
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
  yes: { icon: ThumbsUp, color: "text-green-600", label: "wouldReturnYes" },
  maybe: { icon: Minus, color: "text-amber-500", label: "wouldReturnMaybe" },
  no: { icon: ThumbsDown, color: "text-earth-400", label: "wouldReturnNo" },
};

const AVATAR_COLORS = [
  "bg-emerald-50 text-emerald-700",
  "bg-amber-50 text-amber-700",
  "bg-sky-50 text-sky-700",
  "bg-rose-50 text-rose-700",
  "bg-violet-50 text-violet-700",
  "bg-teal-50 text-teal-700",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function RatingBar({ value, label }: { value: number; label: string }) {
  const pct = value > 0 ? (value / 5) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-[11px] text-earth-500" title={label}>{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-earth-100">
        {pct > 0 && (
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2F5D50] to-[#3d7a6a]"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-3 text-right text-[11px] font-medium text-earth-500">
        {value > 0 ? value : "—"}
      </span>
    </div>
  );
}

interface ReviewsDisplayProps {
  reviews: ReviewWithProvince[];
  averageRating: number;
  totalCount: number;
  categoryAverages: Record<string, number>;
  homestayId: string;
  homestaySlug: string;
}

function PhotoLightbox({
  photos,
  index,
  onClose,
}: {
  photos: string[];
  index: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const prev = useCallback(() => setCurrent((i) => (i > 0 ? i - 1 : photos.length - 1)), [photos.length]);
  const next = useCallback(() => setCurrent((i) => (i < photos.length - 1 ? i + 1 : 0)), [photos.length]);

  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useSwipe(el, { onSwipeLeft: next, onSwipeRight: prev });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, prev, next]);

  return (
    <div
      ref={setEl}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-2xl p-4"
      style={{ touchAction: "none" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-10 rounded-full text-white hover:bg-white/20"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      {photos.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-2 z-10 rounded-full text-white hover:bg-white/20 sm:left-4"
          onClick={prev}
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
      )}

      <div className="flex h-[80vh] w-[90vw] max-w-4xl items-center justify-center">
        <img
          key={photos[current]}
          src={photos[current]}
          alt={`Guest review photo ${current + 1} of ${photos.length}`}
          className="max-h-[80vh] max-w-full h-auto w-auto rounded-2xl object-contain"
        />
      </div>

      {photos.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 z-10 rounded-full text-white hover:bg-white/20 sm:right-4"
            onClick={next}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div className="absolute bottom-6 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm">
            {current + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
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
  const needsClamp = !!review.comment && review.comment.length > 150;
  const province = review.bookings?.guest_province;
  const initials = getInitials(review.guest_name);
  const avatarColor = getAvatarColor(review.guest_name);
  const ALL_CATS = [
    { key: "environment", val: review.rating_environment },
    { key: "cleanliness", val: review.rating_cleanliness },
    { key: "service", val: review.rating_service },
    { key: "value", val: review.rating_value },
  ];

  return (
    <div className="group flex flex-col rounded-2xl border border-earth-100 bg-white p-5 h-full transition-all hover:shadow-lg hover:shadow-gray-100/80">
      {/* Header: avatar + name + score pill */}
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-earth-900 truncate block">{review.guest_name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ProvinceLabel province={province} locale={locale} />
            <span className="text-[11px] text-earth-300">
              {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#2F5D50] px-2.5 py-1 shrink-0">
          <Star className="h-3 w-3" style={{ fill: "white", color: "white" }} />
          <span className="text-xs font-bold text-white">{review.rating}</span>
        </div>
      </div>

      {/* Category rating bars */}
      <div className="mt-3 space-y-1.5">
        {ALL_CATS.map((c) => (
          <RatingBar key={c.key} value={c.val ?? 0} label={t(CATEGORY_I18N[c.key].label)} />
        ))}
      </div>

      {/* Would return */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-earth-500">{t("wouldReturnLabel")}</span>
        {review.would_return && WOULD_RETURN_CONFIG[review.would_return] ? (() => {
          const cfg = WOULD_RETURN_CONFIG[review.would_return!];
          const Icon = cfg.icon;
          return (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
              <Icon className="h-3 w-3" />
              {t(cfg.label as "wouldReturnYes")}
            </span>
          );
        })() : (
          <span className="text-[11px] text-earth-300">—</span>
        )}
      </div>

      {/* Divider */}
      <div className="my-3 h-px bg-gradient-to-r from-earth-100 via-earth-200 to-earth-100" />

      {/* Comment */}
      {review.comment && (
        <p className="text-[13px] leading-relaxed text-earth-600 line-clamp-3">
          {review.comment}
        </p>
      )}

      {/* Photos */}
      {review.photos && review.photos.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {review.photos.map((url, i) => (
            <button key={i} type="button" onClick={() => onPhotoClick(review.photos!, i)} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-earth-100 transition-transform hover:scale-105">
              <img src={url} alt={`Photo ${i + 1} from ${review.guest_name}'s review`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Tags */}
      {review.impression_tags && review.impression_tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {review.impression_tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 rounded-full border border-[#2F5D50]/10 bg-[#2F5D50]/5 px-2 py-0.5 text-[10px] font-medium text-[#2F5D50]">
              <Sparkles className="h-2 w-2" />
              {TAG_I18N[tag] ? t(TAG_I18N[tag]) : tag}
            </span>
          ))}
        </div>
      )}

      {/* Stay highlight */}
      {review.stay_highlight && (
        <div className="mt-2.5 rounded-lg bg-amber-50/60 px-3 py-2">
          <span className="inline-flex items-start gap-1.5 text-[11px] text-amber-800/70 italic leading-relaxed">
            <Quote className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            {review.stay_highlight}
          </span>
        </div>
      )}

      {/* Read more */}
      {needsClamp && (
        <div className="mt-auto pt-3">
          <button type="button" onClick={() => onReadMore(review)} className="text-xs font-medium text-[#2F5D50] hover:text-[#264A40] transition-colors">
            {t("readMore")} &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

function ModalReviewCard({ review, locale, t, onPhotoClick }: { review: ReviewWithProvince; locale: string; t: ReturnType<typeof useTranslations>; onPhotoClick: (photos: string[], index: number) => void }) {
  const province = review.bookings?.guest_province;
  const initials = getInitials(review.guest_name);
  const avatarColor = getAvatarColor(review.guest_name);
  const ALL_CATS = [
    { key: "environment", val: review.rating_environment },
    { key: "cleanliness", val: review.rating_cleanliness },
    { key: "service", val: review.rating_service },
    { key: "value", val: review.rating_value },
  ];

  return (
    <div className="rounded-2xl border border-earth-100 bg-white p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-earth-900 truncate block">{review.guest_name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ProvinceLabel province={province} locale={locale} />
            <span className="text-[11px] text-earth-300">
              {fmtDateStr(review.created_at.split("T")[0], "d MMM yyyy", locale)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#2F5D50] px-2.5 py-1 shrink-0">
          <Star className="h-3 w-3" style={{ fill: "white", color: "white" }} />
          <span className="text-xs font-bold text-white">{review.rating}</span>
        </div>
      </div>

      {/* Category rating bars */}
      <div className="mt-3 space-y-1.5">
        {ALL_CATS.map((c) => (
          <RatingBar key={c.key} value={c.val ?? 0} label={t(CATEGORY_I18N[c.key].label)} />
        ))}
      </div>

      {/* Would return */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-earth-500">{t("wouldReturnLabel")}</span>
        {review.would_return && WOULD_RETURN_CONFIG[review.would_return] ? (() => {
          const cfg = WOULD_RETURN_CONFIG[review.would_return!];
          const Icon = cfg.icon;
          return (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
              <Icon className="h-3 w-3" />
              {t(cfg.label as "wouldReturnYes")}
            </span>
          );
        })() : (
          <span className="text-[11px] text-earth-300">—</span>
        )}
      </div>

      {/* Divider */}
      <div className="my-3 h-px bg-gradient-to-r from-earth-100 via-earth-200 to-earth-100" />

      {/* Comment — full text */}
      {review.comment && (
        <p className="text-[13px] leading-relaxed text-earth-600 whitespace-pre-wrap">{review.comment}</p>
      )}

      {/* Photos — larger */}
      {review.photos && review.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((url, i) => (
            <button key={i} type="button" onClick={() => onPhotoClick(review.photos!, i)} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-earth-100 transition-transform hover:scale-105">
              <img src={url} alt={`Photo ${i + 1} from ${review.guest_name}'s review`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Tags */}
      {review.impression_tags && review.impression_tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {review.impression_tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 rounded-full border border-[#2F5D50]/10 bg-[#2F5D50]/5 px-2 py-0.5 text-[10px] font-medium text-[#2F5D50]">
              <Sparkles className="h-2 w-2" />
              {TAG_I18N[tag] ? t(TAG_I18N[tag]) : tag}
            </span>
          ))}
        </div>
      )}

      {/* Stay highlight */}
      {review.stay_highlight && (
        <div className="mt-2.5 rounded-lg bg-amber-50/60 px-3 py-2">
          <span className="inline-flex items-start gap-1.5 text-[11px] text-amber-800/70 italic leading-relaxed">
            <Quote className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            {review.stay_highlight}
          </span>
        </div>
      )}
    </div>
  );
}

export function ReviewsDisplay({
  reviews: initialReviews,
  averageRating,
  totalCount,
  categoryAverages: _categoryAverages,
  homestayId,
  homestaySlug,
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
    const supabase = createClient();
    const from = reset ? 0 : modalOffsetRef.current;
    const to = from + MODAL_PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from("reviews")
      .select("*, bookings(guest_province)", { count: "exact" })
      .eq("homestay_id", homestayId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const rows = (data as unknown as ReviewWithProvince[]) || [];
    if (reset) setModalReviews(rows);
    else setModalReviews((prev) => [...prev, ...rows]);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div>
              <h3 className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight">{t("title")}</h3>
              {totalCount > 0 ? (
                <div className="flex items-center gap-2">
                  <StarRating rating={Math.round(averageRating)} size={14} />
                  <span className="text-sm font-medium text-earth-900">{averageRating}</span>
                  <span className="text-sm text-earth-500">
                    ({totalCount} {totalCount === 1 ? t("review") : t("reviewPlural")})
                  </span>
                </div>
              ) : (
                <p className="text-sm text-earth-500">{t("noReviews")}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {hasMore && (
              <Button variant="outline" size="sm" onClick={openModal}>
                {t("viewAll")}
              </Button>
            )}
            {totalCount > 0 && (
              <Link href={`/${homestaySlug}/reviews`}>
                <Button variant="outline" size="sm" className="gap-1 w-full">
                  <PenLine className="h-3.5 w-3.5" />
                  {t("writeReview")}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Category averages */}
        {/* {totalCount > 0 && Object.values(categoryAverages).some((v) => v > 0) && (
          <div className="flex flex-wrap gap-3">
            {RATING_CATEGORIES.map((cat) => {
              const avg = categoryAverages[cat.key] || 0;
              if (avg === 0) return null;
              return (
                <div key={cat.key} className="flex items-center gap-1.5 rounded-lg bg-earth-50 px-3 py-1.5">
                  <span className="text-sm font-semibold text-earth-900">{avg}</span>
                  <Star className="h-3 w-3" style={{ fill: "#2F5D50", color: "#2F5D50" }} />
                  <span className="text-xs text-earth-500">{t(CATEGORY_I18N[cat.key].label)}</span>
                </div>
              );
            })}
          </div>
        )} */}

        {/* Review grid */}
        {totalCount > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridReviews.map((review) => (
              <ReviewCard key={review.id} review={review} locale={locale} t={t} onReadMore={setSelectedReview} onPhotoClick={openLightbox} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-earth-200 bg-earth-50/50 py-10 text-center">
            <MessageSquare className="h-8 w-8 text-earth-300" />
            <p className="mt-2 text-sm text-earth-400">{t("noReviewsYet")}</p>
            <Link href={`/${homestaySlug}/reviews`} className="mt-3">
              <Button variant="outline" size="sm" className="gap-1">
                <PenLine className="h-3.5 w-3.5" />
                {t("writeReview")}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* View All Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-earth-600" />
              {t("viewAllTitle")}
              <span className="text-sm font-normal text-earth-500">
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
                  <p className="text-xs text-earth-500">
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
        <DialogContent className="sm:max-w-md">
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
