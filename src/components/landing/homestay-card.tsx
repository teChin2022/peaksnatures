"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Star } from "lucide-react";
import { motion } from "motion/react";

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
}: HomestayCardProps) {
  const images = [heroImageUrl, ...gallery.slice(0, 1)].filter(Boolean) as string[];
  const [currentImage] = useState(0);

  return (
    <Link href={`/${slug}`}>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="group cursor-pointer"
      >
        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-3 shadow-sm card-hover">
          {images[currentImage] ? (
            <Image
              src={images[currentImage]}
              alt={name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400 text-sm">No image</span>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex justify-center gap-1.5">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    idx === currentImage ? "bg-white w-3" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{name}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin size={12} /> {location}
            </p>
            {tagline && (
              <p className="text-xs text-gray-400 mt-1 italic line-clamp-1">
                {tagline}
              </p>
            )}
            {minPrice !== null && (
              <p className="mt-2 text-sm font-medium">
                <span className="text-lg font-bold">
                  ฿{minPrice.toLocaleString()}
                </span>
                <span className="text-gray-500"> / คืน</span>
              </p>
            )}
          </div>
          {reviewCount > 0 && (
            <div className="flex items-center gap-1 text-sm font-medium">
              <Star size={14} className="fill-gray-800 text-gray-800" />
              <span>{averageRating}</span>
              <span className="text-gray-400 text-xs">({reviewCount})</span>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
