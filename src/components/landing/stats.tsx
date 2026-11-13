"use client";

import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import type { LandingStat } from "@/lib/landing-stats";

export function LandingStats({ stats }: { stats: LandingStat[] }) {
  const t = useTranslations("home.stats");
  if (stats.length === 0) return null;

  return (
    <section className="bg-white border-y border-earth-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 flex flex-wrap justify-center gap-y-10 md:divide-x md:divide-earth-200">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="w-1/2 md:w-auto md:flex-1 px-4 text-center"
          >
            <p className="flex items-center justify-center gap-1.5 font-serif lining-nums text-4xl md:text-5xl text-earth-900 tracking-tight">
              {stat.value}
              {stat.star && <Star size={28} className="fill-earth-800 text-earth-800" />}
            </p>
            <p className="mt-2 text-sm text-earth-600">{t(stat.label, { count: stat.count ?? "" })}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
