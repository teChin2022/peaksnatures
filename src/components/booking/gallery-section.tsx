"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2UyZThmMCIvPjwvc3ZnPg==";

interface GallerySectionProps {
  images: string[];
  name: string;
}

function GalleryImage({
  src,
  alt,
  sizes,
  eager,
  onClick,
}: {
  src: string;
  alt: string;
  sizes: string;
  eager?: boolean;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <button onClick={onClick} className="group relative h-full w-full overflow-hidden rounded-xl">
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className={`h-full w-full object-cover group-hover:scale-105 ${
          loaded ? "opacity-100 transition-transform duration-500" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}
      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </button>
  );
}

export function GallerySection({ images, name }: GallerySectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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

  return (
    <>
      <section className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-4 text-xl font-semibold text-gray-900"
          >
            {t("title")}
          </motion.h2>

          {hasEnoughForSpecialLayout ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2">
                {/* Main large image */}
                <div className="col-span-2 row-span-2 aspect-[4/3] md:aspect-auto">
                  <GalleryImage
                    src={displayImages[0]}
                    alt={`${name} photo 1`}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    eager
                    onClick={() => setLightboxIndex(0)}
                  />
                </div>

                {/* 4 smaller images */}
                {displayImages.slice(1, 5).map((img, i) => (
                  <div key={i + 1} className="aspect-[4/3] overflow-hidden rounded-xl">
                    <GalleryImage
                      src={img}
                      alt={`${name} photo ${i + 2}`}
                      sizes="(max-width: 768px) 50vw, 25vw"
                      eager={i < 1}
                      onClick={() => setLightboxIndex(i + 1)}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {images.map((img, i) => (
                  <div key={i} className="aspect-[4/3] overflow-hidden rounded-xl">
                    <GalleryImage
                      src={img}
                      alt={`${name} photo ${i + 1}`}
                      sizes="(max-width: 640px) 50vw, 25vw"
                      eager={i === 0}
                      onClick={() => setLightboxIndex(i)}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-2xl p-4"
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

          <div className="flex h-[85vh] w-[90vw] max-w-5xl items-center justify-center">
            <Image
              key={images[lightboxIndex]}
              src={images[lightboxIndex]}
              alt={`${name} photo ${lightboxIndex + 1}`}
              width={1920}
              height={1080}
              sizes="90vw"
              priority
              className="max-h-[85vh] max-w-full h-auto w-auto rounded-2xl"
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
