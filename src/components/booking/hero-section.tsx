"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
  isVerified?: boolean;
}

export function HeroSection({
  name,
  tagline,
  heroImageUrl,
  isVerified,
}: HeroSectionProps) {
  const t = useTranslations("hero");
  return (
    <section className="relative h-[50vh] min-h-[360px] overflow-hidden sm:h-[60vh]">
      {heroImageUrl && (
        <Image
          src={heroImageUrl}
          alt={name}
          fill
          sizes="100vw"
          priority
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
        <div className="mx-auto max-w-7xl">
          {tagline && (
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-2 text-sm font-medium uppercase tracking-wider text-white/80"
            >
              {tagline}
            </motion.p>
          )}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-3xl font-bold font-serif text-white sm:text-4xl md:text-5xl"
          >
            {name}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-3 h-1 w-16 origin-left rounded-full bg-white/60"
          />
          {isVerified && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-white/90">{t("verifiedHost")}</span>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
