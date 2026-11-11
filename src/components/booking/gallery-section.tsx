"use client";

import { useState, useCallback } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";
import { bentoSpans } from "@/lib/gallery-layout";

// A flat Sand (earth-200) frame while a photo loads.
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2UwZDVjOCIvPjwvc3ZnPg==";

/** One round of the bento pattern; "show all photos" opens the rest. */
const MAX_TILES = 7;
/** Phones show one wide tile and two halves: the gallery opens the page, so it stays short there. */
const MOBILE_TILES = 3;
// Desktop rows: wide + one, three, one + wide. Phones: one full width, then two halves.
const DESKTOP_PATTERN = [2, 1, 1, 1, 1, 1, 2];
const MOBILE_PATTERN = [2, 1, 1];
// Whole class names, so Tailwind generates every span the layout can produce.
const MOBILE_SPAN: Record<number, string> = { 1: "col-span-1", 2: "col-span-2" };
const DESKTOP_SPAN: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3" };

interface GallerySectionProps {
  images: string[];
  name: string;
}

export function GallerySection({ images, name }: GallerySectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const t = useTranslations("gallery");
  const tr = useTranslations("rooms");
  const tc = useTranslations("common");

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevImage = useCallback(
    () => setLightboxIndex((i) => (i !== null ? (i > 0 ? i - 1 : images.length - 1) : null)),
    [images.length]
  );
  const nextImage = useCallback(
    () => setLightboxIndex((i) => (i !== null ? (i < images.length - 1 ? i + 1 : 0) : null)),
    [images.length]
  );

  const [lightboxEl, setLightboxEl] = useState<HTMLDivElement | null>(null);
  useSwipe(lightboxEl, { onSwipeLeft: nextImage, onSwipeRight: prevImage });

  if (!images.length) return null;

  const shown = images.slice(0, MAX_TILES);
  const mobileSpans = bentoSpans(shown.length, 2, MOBILE_PATTERN);
  const desktopSpans = bentoSpans(shown.length, 3, DESKTOP_PATTERN);
  const photoAlt = (i: number) => t("photoAlt", { name, number: i + 1 });

  return (
    <>
      <section id="gallery" className="scroll-mt-20 py-14 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-10">
            <div>
              <SectionMark />
              <SectionHeading>{t("title")}</SectionHeading>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-earth-600 md:text-right">{t("subtitle")}</p>
          </div>

          <div className="grid auto-rows-[11rem] grid-cols-2 gap-1.5 sm:auto-rows-[15rem] md:auto-rows-[20rem] md:grid-cols-3 lg:auto-rows-[25rem]">
            {shown.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className={`group relative overflow-hidden rounded-xl bg-earth-200 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${MOBILE_SPAN[mobileSpans[i]]} ${DESKTOP_SPAN[desktopSpans[i]]} ${
                  i >= MOBILE_TILES ? "hidden md:block" : ""
                }`}
              >
                {/* Visible as soon as it loads: no fade-in that waits for JavaScript. */}
                <Image
                  src={img}
                  alt={photoAlt(i)}
                  fill
                  sizes={`(max-width: 768px) ${mobileSpans[i] * 50}vw, ${desktopSpans[i] * 33}vw`}
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              </button>
            ))}
          </div>
          {images.length > MOBILE_TILES && (
            // Phones offer the rest from the fourth photo on; wider screens once there are more than the grid holds.
            <div className={`mt-6 text-center ${images.length > MAX_TILES ? "" : "md:hidden"}`}>
              <Button
                type="button"
                variant="outline"
                // DESIGN.md secondary: Sand border, Teak Deep label, no shadow; Forest focus ring.
                className="h-11 rounded-full border-earth-200 text-earth-800 shadow-none focus-visible:border-earth-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                onClick={() => setLightboxIndex(0)}
              >
                {t("showAll")} ({images.length})
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* A Radix dialog: focus, Escape, scroll lock and stacking come with it. */}
      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && closeLightbox()}>
        <DialogContent
          ref={setLightboxEl}
          showCloseButton={false}
          overlayClassName="bg-black/60 backdrop-blur-2xl"
          className="inset-0 top-0 left-0 flex h-full w-full max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-0 bg-transparent p-4 shadow-none sm:max-w-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") prevImage();
            if (e.key === "ArrowRight") nextImage();
          }}
        >
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{name}</DialogDescription>
          {lightboxIndex !== null && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tc("close")}
                className="absolute right-4 top-4 z-10 size-11 rounded-full text-white hover:bg-white/20"
                onClick={closeLightbox}
              >
                <X className="h-6 w-6" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                aria-label={tr("prevPhoto")}
                className="absolute left-2 z-10 size-11 rounded-full text-white hover:bg-white/20 sm:left-4"
                onClick={prevImage}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>

              <div className="flex h-[85svh] w-[90vw] max-w-5xl items-center justify-center">
                <Image
                  key={images[lightboxIndex]}
                  src={images[lightboxIndex]}
                  alt={photoAlt(lightboxIndex)}
                  width={1920}
                  height={1080}
                  sizes="90vw"
                  priority
                  className="max-h-[85svh] max-w-full h-auto w-auto rounded-2xl"
                />
              </div>

              {/* Preload adjacent images */}
              {images.length > 1 && (
                <div className="hidden">
                  {lightboxIndex > 0 && (
                    <Image src={images[lightboxIndex - 1]} alt="" width={32} height={32} />
                  )}
                  {lightboxIndex < images.length - 1 && (
                    <Image src={images[lightboxIndex + 1]} alt="" width={32} height={32} />
                  )}
                </div>
              )}

              <Button
                variant="ghost"
                size="icon"
                aria-label={tr("nextPhoto")}
                className="absolute right-2 z-10 size-11 rounded-full text-white hover:bg-white/20 sm:right-4"
                onClick={nextImage}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>

              <div className="absolute bottom-6 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm">
                {lightboxIndex + 1} / {images.length}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
