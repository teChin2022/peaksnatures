"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { MapPin, ShieldCheck, Star } from "lucide-react";

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
  /** Landscape photo from lg, for when two cards share the row. */
  wide?: boolean;
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
  wide = false,
}: HomestayCardProps) {
  const t = useTranslations("home.card");
  // Fall back to the first gallery image when no hero image is set
  const mainImage = heroImageUrl || gallery[0] || null;

  return (
    <Link
      href={`/${slug}`}
      className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-earth-50"
    >
      {/* Flat at rest (DESIGN.md); the small lift and zoom run only when the visitor allows motion. */}
      <div className="group cursor-pointer motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1">
        <div className={`relative aspect-[4/3] sm:aspect-[4/5] ${wide ? "lg:aspect-[4/3]" : ""} rounded-2xl overflow-hidden mb-3`}>
          {mainImage ? (
            <Image
              src={mainImage}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full bg-earth-100 flex items-center justify-center">
              <span className="text-earth-600 text-sm">{t("noImage")}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            {/* DESIGN.md Title role: the place name in serif. */}
            <h3 className="font-serif text-2xl leading-[1.333] text-earth-900">{name}</h3>
            <p className="text-sm text-earth-600 flex items-center gap-1">
              <MapPin size={12} /> {location}
            </p>
            {tagline && (
              <p className="text-sm text-earth-600 mt-1 line-clamp-1">
                {tagline}
              </p>
            )}
            {isHostVerified && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                <ShieldCheck size={14} aria-hidden="true" />
                {t("verifiedHost")}
              </p>
            )}
            {/* min_price is the cheapest active house, so it is a starting price; null means no house is open. */}
            {minPrice !== null ? (
              <p className="mt-3 text-sm text-earth-600">
                {t("from")} ฿
                {/* DESIGN.md Price role: serif, lining tabular figures (old-style ones read ฿100 as ฿1OO). */}
                <span className="font-serif text-2xl text-earth-900" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                  {minPrice.toLocaleString("th-TH")}
                </span>{" "}
                {t("perNight")}
              </p>
            ) : (
              <p className="mt-2 text-sm text-earth-600">{t("closed")}</p>
            )}
          </div>
          {reviewCount > 0 && (
            <div className="flex shrink-0 items-center gap-1 pt-1 text-sm font-medium">
              <Star size={14} className="fill-earth-800 text-earth-800" aria-hidden="true" />
              <span className="text-earth-800" aria-hidden="true">{averageRating}</span>
              <span className="text-earth-600 text-xs" aria-hidden="true">({reviewCount})</span>
              <span className="sr-only">{t("ratingAria", { rating: averageRating, count: reviewCount })}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
