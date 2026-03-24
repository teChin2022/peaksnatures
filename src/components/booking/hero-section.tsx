"use client";

import Image from "next/image";
import { motion } from "motion/react";

interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
}

export function HeroSection({
  name,
  tagline,
  heroImageUrl,
}: HeroSectionProps) {
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
        </div>
      </div>
    </section>
  );
}
