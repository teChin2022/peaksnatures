"use client";

import { useState, useCallback, useRef } from "react";
import { Star, ImagePlus, X, Loader2, Sparkles, ThumbsUp, Minus, ThumbsDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress-image";
import {
  IMPRESSION_TAGS,
  RATING_CATEGORIES,
  WOULD_RETURN_OPTIONS,
  MAX_REVIEW_PHOTOS,
} from "@/lib/review-constants";

const TAG_I18N_MAP: Record<string, string> = {
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

const CATEGORY_I18N_MAP: Record<string, { label: string; sub: string }> = {
  environment: { label: "categoryEnvironment", sub: "categoryEnvironmentSub" },
  cleanliness: { label: "categoryCleanliness", sub: "categoryCleanlinessSub" },
  service: { label: "categoryService", sub: "categoryServiceSub" },
  value: { label: "categoryValue", sub: "categoryValueSub" },
};

const WOULD_RETURN_I18N: Record<string, { label: string; icon: typeof ThumbsUp }> = {
  yes: { label: "wouldReturnYes", icon: ThumbsUp },
  maybe: { label: "wouldReturnMaybe", icon: Minus },
  no: { label: "wouldReturnNo", icon: ThumbsDown },
};

interface ReviewFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestEmail: string;
  homestayId: string;
  onSuccess: () => void;
}

function InteractiveStars({
  value,
  hover,
  onSelect,
  onHover,
  onLeave,
  size = 20,
}: {
  value: number;
  hover: number;
  onSelect: (v: number) => void;
  onHover: (v: number) => void;
  onLeave: () => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="p-0.5 transition-transform hover:scale-110"
          onClick={() => onSelect(star)}
          onMouseEnter={() => onHover(star)}
          onMouseLeave={onLeave}
        >
          <Star
            style={{
              width: size,
              height: size,
              fill: star <= (hover || value) ? "#2F5D50" : "transparent",
              color: star <= (hover || value) ? "#2F5D50" : "#d1d5db",
            }}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({
  open,
  onOpenChange,
  bookingId,
  guestEmail,
  homestayId,
  onSuccess,
}: ReviewFormProps) {
  const t = useTranslations("reviews");

  // Form state
  const [topic, setTopic] = useState("");
  const [overallRating, setOverallRating] = useState(0);
  const [overallHover, setOverallHover] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({
    environment: 0,
    cleanliness: 0,
    service: 0,
    value: 0,
  });
  const [categoryHovers, setCategoryHovers] = useState<Record<string, number>>({
    environment: 0,
    cleanliness: 0,
    service: 0,
    value: 0,
  });
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [wouldReturn, setWouldReturn] = useState<string | null>(null);
  const [stayHighlight, setStayHighlight] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_REVIEW_PHOTOS - photos.length;
    const toAdd = files.slice(0, remaining);

    const newPhotos = await Promise.all(
      toAdd.map(async (file) => {
        const compressed = await compressImage(file, { maxDimension: 1920 });
        return { file: compressed, preview: URL.createObjectURL(compressed) };
      })
    );

    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [photos.length]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const isValid =
    topic.trim().length > 0 &&
    overallRating > 0 &&
    Object.values(categoryRatings).every((v) => v > 0) &&
    comment.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);

    try {
      // Upload photos first
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        setUploadingPhotos(true);
        const supabase = createClient();
        photoUrls = await Promise.all(
          photos.map(async (photo) => {
            const ts = Date.now();
            const rand = Math.random().toString(36).slice(2, 8);
            const path = `reviews/${homestayId}/${ts}-${rand}.webp`;
            await supabase.storage.from("review-photos").upload(path, photo.file, { contentType: "image/webp" });
            const { data: { publicUrl } } = supabase.storage.from("review-photos").getPublicUrl(path);
            return publicUrl;
          })
        );
        setUploadingPhotos(false);
      }

      // Submit review
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          guest_email: guestEmail,
          topic: topic.trim(),
          rating: overallRating,
          rating_environment: categoryRatings.environment,
          rating_cleanliness: categoryRatings.cleanliness,
          rating_service: categoryRatings.service,
          rating_value: categoryRatings.value,
          comment: comment.trim(),
          photos: photoUrls,
          impression_tags: selectedTags,
          would_return: wouldReturn,
          stay_highlight: stayHighlight.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "ALREADY_REVIEWED") {
          toast.error(t("errorAlreadyReviewed"));
        } else if (data.error === "BOOKING_NOT_COMPLETED") {
          toast.error(t("errorBookingNotCompleted"));
        } else {
          toast.error(t("errorSubmit"));
        }
        return;
      }

      toast.success(t("reviewSubmitted"));
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error(t("errorSubmit"));
    } finally {
      setSubmitting(false);
      setUploadingPhotos(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8 sm:px-6">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">{t("writeReview")}</SheetTitle>
        </SheetHeader>

        <div className="mx-auto max-w-lg space-y-6">
          {/* Topic */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("topicLabel")}</Label>
            <Input
              placeholder={t("topicPlaceholder")}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Overall rating */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("ratingLabel")}</Label>
            <div className="flex items-center gap-2">
              <InteractiveStars
                value={overallRating}
                hover={overallHover}
                onSelect={setOverallRating}
                onHover={setOverallHover}
                onLeave={() => setOverallHover(0)}
                size={28}
              />
              {overallRating === 0 && (
                <span className="text-xs text-gray-400">{t("tapToRate")}</span>
              )}
            </div>
          </div>

          {/* Category ratings */}
          <div className="space-y-3">
            {RATING_CATEGORIES.map((cat) => (
              <div key={cat.key} className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {t(CATEGORY_I18N_MAP[cat.key].label)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t(CATEGORY_I18N_MAP[cat.key].sub)}
                  </p>
                </div>
                <InteractiveStars
                  value={categoryRatings[cat.key]}
                  hover={categoryHovers[cat.key]}
                  onSelect={(v) => setCategoryRatings((prev) => ({ ...prev, [cat.key]: v }))}
                  onHover={(v) => setCategoryHovers((prev) => ({ ...prev, [cat.key]: v }))}
                  onLeave={() => setCategoryHovers((prev) => ({ ...prev, [cat.key]: 0 }))}
                  size={20}
                />
              </div>
            ))}
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("commentLabel")}</Label>
            <Textarea
              placeholder={t("commentPlaceholder")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <div>
              <Label className="text-sm font-medium">{t("photosLabel")}</Label>
              <p className="text-xs text-gray-400">{t("photosHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden border border-gray-200">
                  <img src={photo.preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_REVIEW_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500"
                >
                  <ImagePlus className="h-6 w-6" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          {/* Impression tags */}
          <div className="space-y-2">
            <div>
              <Label className="text-sm font-medium">{t("impressionTagsLabel")}</Label>
              <p className="text-xs text-gray-400">{t("impressionTagsHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {IMPRESSION_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? "bg-[#2F5D50] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {selected && <Sparkles className="h-3 w-3" />}
                    {t(TAG_I18N_MAP[tag])}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Would return */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("wouldReturnLabel")}</Label>
            <div className="flex gap-2">
              {WOULD_RETURN_OPTIONS.map((option) => {
                const selected = wouldReturn === option;
                const Icon = WOULD_RETURN_I18N[option].icon;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setWouldReturn(selected ? null : option)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      selected
                        ? "border-[#2F5D50] bg-[#2F5D50]/5 text-[#2F5D50]"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(WOULD_RETURN_I18N[option].label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stay highlight */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("stayHighlightLabel")}</Label>
            <Input
              placeholder={t("stayHighlightPlaceholder")}
              value={stayHighlight}
              onChange={(e) => setStayHighlight(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full bg-[#2F5D50] text-white hover:bg-[#264A40]"
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploadingPhotos ? t("photosLabel") : t("submitting")}
              </>
            ) : (
              t("submitReview")
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
