"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ShieldCheck, Star, ChevronLeft, ChevronRight } from "lucide-react";

interface HomestayCardProps {
  slug: string;
  name: string;
  location: string;
  heroImageUrl: string | null;
  gallery: string[];
  minPrice: number | null;
  maxGuests: number;
  tagline: string | null;
  reviewCount: number;
  averageRating: number;
  isHostVerified: boolean;
}

export function HomestayCard({
  slug,
  name,
  location,
  heroImageUrl,
  gallery,
  minPrice,
  tagline,
  reviewCount,
  averageRating,
  isHostVerified,
}: HomestayCardProps) {
  const images = [heroImageUrl, ...gallery.slice(0, 2)].filter(Boolean) as string[];
  const [currentImage, setCurrentImage] = useState(0);

  const prevImage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCurrentImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    },
    [images.length]
  );

  const nextImage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCurrentImage((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    },
    [images.length]
  );

  return (
    <Link href={`/${slug}`}>
      <div className="group cursor-pointer transition-transform duration-300 hover:-translate-y-2">
        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-3 shadow-sm">
          {images[currentImage] ? (
            <Image
              src={images[currentImage]}
              alt={name}
              fill
              sizes="(max-width: 640px) 85vw, (max-width: 1024px) 50vw, 33vw"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-earth-100 flex items-center justify-center">
              <span className="text-earth-400 text-sm">No image</span>
            </div>
          )}

          {isHostVerified && (
            <div className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm shadow-md">
              <ShieldCheck size={18} className="text-emerald-600" />
            </div>
          )}

          {/* Carousel arrows — visible on hover when multiple images */}
          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              >
                <ChevronLeft size={16} className="text-earth-800" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              >
                <ChevronRight size={16} className="text-earth-800" />
              </button>
            </>
          )}

          {/* Image dots */}
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/40 to-transparent">
              <div className="flex justify-center gap-1.5">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === currentImage ? "bg-white w-3" : "bg-white/50 w-1.5"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-semibold text-earth-900">{name}</h3>
            <p className="text-sm text-earth-500 flex items-center gap-1">
              <MapPin size={12} /> {location}
            </p>
            {tagline && (
              <p className="text-xs text-earth-400 mt-1 italic line-clamp-1">
                {tagline}
              </p>
            )}
            {minPrice !== null && (
              <p className="mt-2 text-sm font-medium">
                <span className="text-lg font-bold">
                  ฿{minPrice.toLocaleString()}
                </span>
                <span className="text-earth-500"> / คืน</span>
              </p>
            )}
          </div>
          {reviewCount > 0 && (
            <div className="flex items-center gap-1 text-sm font-medium">
              <Star size={14} className="fill-earth-800 text-earth-800" />
              <span className="text-earth-800">{averageRating}</span>
              <span className="text-earth-400 text-xs">({reviewCount})</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
