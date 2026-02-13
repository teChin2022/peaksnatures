"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GallerySectionProps {
  images: string[];
  name: string;
}

export function GallerySection({ images, name }: GallerySectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images.length) return null;

  return (
    <>
      <section className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Gallery</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setLightboxIndex(i)}
                className="group relative aspect-[4/3] overflow-hidden rounded-lg"
              >
                <img
                  src={img}
                  alt={`${name} photo ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 text-white hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 text-white hover:bg-white/20"
            onClick={() =>
              setLightboxIndex(
                lightboxIndex > 0 ? lightboxIndex - 1 : images.length - 1
              )
            }
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <img
            src={images[lightboxIndex]}
            alt={`${name} photo ${lightboxIndex + 1}`}
            className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
          />

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 text-white hover:bg-white/20"
            onClick={() =>
              setLightboxIndex(
                lightboxIndex < images.length - 1 ? lightboxIndex + 1 : 0
              )
            }
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div className="absolute bottom-6 text-sm text-white/70">
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}
