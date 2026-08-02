"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, Star } from "lucide-react";

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
}: HomestayCardProps) {
  // Fall back to the first gallery image when no hero image is set
  const mainImage = heroImageUrl || gallery[0] || null;

  return (
    <Link href={`/${slug}`}>
      <div className="group cursor-pointer transition-transform duration-300 hover:-translate-y-2">
        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-3 shadow-sm">
          {mainImage ? (
            <Image
              src={mainImage}
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
