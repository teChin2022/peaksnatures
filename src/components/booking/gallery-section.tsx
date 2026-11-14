"use client";

import { useState, useCallback, type CSSProperties } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";

// A flat Mist 2 frame while a photo loads.
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI0U5RUNFNyIvPjwvc3ZnPg==";

/** The mosaic holds five photos from md up; "show all photos" opens the rest. */
const MAX_TILES = 5;
/** Phones show one wide tile and two squares: the gallery opens the page, so it stays short there. */
const MOBILE_TILES = 3;
// md+ is a 4-column, 2-row mosaic: the first photo takes a 2x2 block and the rest fill the other half.
// Whole class names, by photo count, so Tailwind generates every span the layout can produce.
const DESKTOP_SPANS: Record<number, string[]> = {
  1: ["md:col-span-4 md:row-span-2"],
  2: ["md:col-span-2 md:row-span-2", "md:col-span-2 md:row-span-2"],
  3: ["md:col-span-2 md:row-span-2", "md:col-span-2", "md:col-span-2"],
  4: ["md:col-span-2 md:row-span-2", "md:col-span-2", "md:col-span-1", "md:col-span-1"],
  5: ["md:col-span-2 md:row-span-2", "md:col-span-1", "md:col-span-1", "md:col-span-1", "md:col-span-1"],
};

/** Glide the strip to the new thumbnail, unless the visitor asked for less motion. */
export const thumbScroll = (): ScrollBehavior =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

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
  const desktopSpans = DESKTOP_SPANS[shown.length];
  // Phones: the first photo (and a lone second one) spans the row at 4:3; the others are squares.
  const mobileWide = (i: number) => i === 0 || (i === 1 && shown.length === 2);
  const photoAlt = (i: number) => t("photoAlt", { name, number: i + 1 });

  return (
    <>
      <section id="gallery" className="scroll-mt-20 py-14 md:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionMark />
          <SectionHeading>{t("title")}</SectionHeading>
          <p className="mt-3 max-w-[52ch] text-base leading-relaxed text-ink-2">{t("subtitle")}</p>

          <div className="relative mt-8">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:grid-rows-[15rem_15rem] lg:grid-rows-[17.5rem_17.5rem]">
              {shown.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  // Unveils as it scrolls in (RevealScope), one tile after another; the clip follows the tile's 16px corners.
                  data-reveal-kind="unveil"
                  style={{ "--unveil-r": "16px", "--unveil-delay": `${i * 90}ms` } as CSSProperties}
                  onClick={() => setLightboxIndex(i)}
                  className={`group relative overflow-hidden rounded-2xl bg-mist-2 outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-mist md:aspect-auto ${
                    mobileWide(i) ? "col-span-2 aspect-[4/3]" : "aspect-square"
                  } ${desktopSpans[i]} ${i >= MOBILE_TILES ? "hidden md:block" : ""}`}
                >
                  {/* Visible as soon as it loads: no fade-in that waits for JavaScript. */}
                  <Image
                    src={img}
                    alt={photoAlt(i)}
                    fill
                    sizes={i === 0 || mobileWide(i) ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                </button>
              ))}
            </div>
            {images.length > MOBILE_TILES && (
              // Over the last tile. Phones offer the rest from the fourth photo on; wider screens once there are more than the mosaic holds.
              <button
                type="button"
                className={`absolute right-3 bottom-3 inline-flex min-h-11 items-center rounded-full bg-white/95 px-4 text-sm font-medium text-ink outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 ${
                  images.length > MAX_TILES ? "" : "md:hidden"
                }`}
                onClick={() => setLightboxIndex(0)}
              >
                {t("showAll")} ({images.length})
              </button>
            )}
          </div>
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
                className="absolute left-2 z-10 size-12 rounded-full bg-white/20 text-white hover:bg-white/30 sm:left-4"
                onClick={prevImage}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>

              <div className="relative flex max-h-[80svh] max-w-[90vw] overflow-hidden rounded-2xl">
                <Image
                  key={images[lightboxIndex]}
                  src={images[lightboxIndex]}
                  alt={photoAlt(lightboxIndex)}
                  width={1920}
                  height={1080}
                  sizes="90vw"
                  priority
                  className="max-h-[80svh] max-w-full h-auto w-auto"
                />
                {images.length > 1 && (
                  <div className="absolute inset-x-0 bottom-0 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={photoAlt(i)}
                        aria-current={i === lightboxIndex}
                        onClick={() => setLightboxIndex(i)}
                        ref={(el) => {
                          if (i === lightboxIndex)
                            el?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: thumbScroll() });
                        }}
                        // The ring, opacity and size ease between thumbnails as the photo changes; reduced motion swaps them instantly.
                        className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-md outline-none ring-2 transition-[opacity,transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-white motion-reduce:transition-none sm:h-14 sm:w-20 ${
                          i === lightboxIndex ? "scale-100 ring-white" : "scale-90 opacity-70 ring-transparent hover:opacity-100"
                        }`}
                      >
                        <Image src={img} alt="" fill sizes="80px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
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
                className="absolute right-2 z-10 size-12 rounded-full bg-white/20 text-white hover:bg-white/30 sm:right-4"
                onClick={nextImage}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>

              <div className="absolute bottom-4 text-sm font-medium text-white/80">
                {lightboxIndex + 1} / {images.length}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
