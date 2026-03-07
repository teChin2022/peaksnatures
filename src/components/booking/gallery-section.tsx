"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface GallerySectionProps {
  images: string[];
  name: string;
}

export function GallerySection({ images, name }: GallerySectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const t = useTranslations("gallery");

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevImage = useCallback(
    () => setLightboxIndex((i) => (i !== null ? (i > 0 ? i - 1 : images.length - 1) : null)),
    [images.length]
  );
  const nextImage = useCallback(
    () => setLightboxIndex((i) => (i !== null ? (i < images.length - 1 ? i + 1 : 0) : null)),
    [images.length]
  );
  const handleImageLoad = useCallback((index: number) => {
    setLoaded((prev) => new Set(prev).add(index));
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, closeLightbox, prevImage, nextImage]);

  if (!images.length) return null;

  const hasEnoughForSpecialLayout = images.length >= 5;
  const displayImages = hasEnoughForSpecialLayout ? images.slice(0, 5) : images;
  const allVisible = hasEnoughForSpecialLayout
    ? [0, 1, 2, 3, 4].every((i) => loaded.has(i))
    : images.every((_, i) => loaded.has(i));

  return (
    <>
      <section className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">{t("title")}</h2>

          {/* Skeleton loader matching gallery layout */}
          {!allVisible && (
            <div className="overflow-hidden rounded-xl">
              {hasEnoughForSpecialLayout ? (
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 md:grid-rows-2">
                  <Skeleton className="col-span-2 row-span-2 aspect-[4/3]" />
                  <Skeleton className="aspect-[4/3]" />
                  <Skeleton className="aspect-[4/3]" />
                  <Skeleton className="aspect-[4/3]" />
                  <Skeleton className="aspect-[4/3]" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {displayImages.map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3]" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actual gallery (hidden until all images loaded) */}
          <div className={allVisible ? "" : "invisible absolute"}>
            {hasEnoughForSpecialLayout ? (
              <div className="overflow-hidden rounded-xl">
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 md:grid-rows-2">
                  {/* Main large image */}
                  <button
                    onClick={() => setLightboxIndex(0)}
                    className="group relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden md:aspect-auto"
                  >
                    <Image
                      src={displayImages[0]}
                      alt={`${name} photo 1`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onLoad={() => handleImageLoad(0)}
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                  </button>

                  {/* 4 smaller images */}
                  {displayImages.slice(1, 5).map((img, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setLightboxIndex(i + 1)}
                      className="group relative aspect-[4/3] overflow-hidden"
                    >
                      <Image
                        src={img}
                        alt={`${name} photo ${i + 2}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onLoad={() => handleImageLoad(i + 1)}
                      />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIndex(i)}
                      className="group relative aspect-[4/3] overflow-hidden"
                    >
                      <Image
                        src={img}
                        alt={`${name} photo ${i + 1}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onLoad={() => handleImageLoad(i)}
                      />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-10 rounded-full text-white hover:bg-white/20"
            onClick={closeLightbox}
          >
            <X className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 z-10 rounded-full text-white hover:bg-white/20 sm:left-4"
            onClick={prevImage}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <div className="relative max-h-[85vh] max-w-[90vw]">
            <Image
              src={images[lightboxIndex]}
              alt={`${name} photo ${lightboxIndex + 1}`}
              width={1200}
              height={800}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 z-10 rounded-full text-white hover:bg-white/20 sm:right-4"
            onClick={nextImage}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div className="absolute bottom-6 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm">
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}
