"use client";

import React from "react";
import Image from "next/image";
import { MapPin, ShieldCheck, Star, BadgeCheck, CalendarX } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useTranslations } from "next-intl";

interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
  location?: string;
  isVerified?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

export function HeroSection({
  name,
  tagline,
  heroImageUrl,
  location,
  isVerified,
  averageRating = 0,
  reviewCount = 0,
}: HeroSectionProps) {
  const t = useTranslations("hero");
  const { scrollY } = useScroll();
  const imageY = useTransform(scrollY, [0, 500], [0, 80]);
  const contentOpacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section className="relative h-[100svh] md:h-auto md:aspect-[16/9] md:max-h-[85vh] md:min-h-[520px] w-full overflow-hidden hero-mist">
      {/* Parallax image */}
      <motion.div style={{ y: imageY }} className="absolute inset-0">
        {heroImageUrl && (
          <Image
            src={heroImageUrl}
            alt={name}
            fill
            sizes="100vw"
            priority
            quality={85}
            className="object-cover object-center"
          />
        )}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 via-60% to-[#2F5D50]/20" />

      <motion.div
        style={{ opacity: contentOpacity }}
        className="absolute bottom-0 left-0 right-0 p-6 sm:p-10"
      >
        <div className="mx-auto max-w-7xl">
          {location && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-1.5 mb-3"
            >
              <MapPin size={12} className="text-white/60" />
              <span className="text-white/60 text-xs uppercase tracking-[0.15em]">{location}</span>
            </motion.div>
          )}
          {tagline && (
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-2 text-sm font-medium uppercase tracking-wider text-white/80"
            >
              {tagline}
            </motion.p>
          )}
          <motion.h1
            initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, ease: [0.25, 0.1, 0, 1] }}
            className="text-3xl font-bold font-serif text-white sm:text-4xl md:text-5xl tracking-tight"
          >
            {name}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-white/90"
          >
            {(() => {
              const items: React.ReactNode[] = [];
              if (averageRating > 0) {
                items.push(
                  <span key="rating" className="inline-flex items-center gap-1.5">
                    <Star size={14} className="fill-amber-300 text-amber-300" />
                    {averageRating.toFixed(1)}
                    {reviewCount > 0 && (
                      <span className="text-white/70">({reviewCount})</span>
                    )}
                  </span>
                );
              }
              if (isVerified) {
                items.push(
                  <span key="verified" className="inline-flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-brand-200" />
                    {t("verifiedHost")}
                  </span>
                );
              }
              items.push(
                <span key="instantConfirm" className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={14} className="text-brand-200" />
                  {t("instantConfirm")}
                </span>
              );
              items.push(
                <span key="freeCancellation" className="inline-flex items-center gap-1.5">
                  <CalendarX size={14} className="text-brand-200" />
                  {t("freeCancellation")}
                </span>
              );
              return items.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-white/40">•</span>}
                  {item}
                </React.Fragment>
              ));
            })()}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-3 h-0.5 w-12 origin-left rounded-full bg-white/40"
          />
        </div>
      </motion.div>
    </section>
  );
}
