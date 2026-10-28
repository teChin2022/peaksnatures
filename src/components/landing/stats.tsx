"use client";

import { Star } from "lucide-react";
import { motion } from "motion/react";
import type { LandingStat } from "@/lib/landing-stats";

export function LandingStats({ stats }: { stats: LandingStat[] }) {
  if (stats.length === 0) return null;

  return (
    <section className="bg-white border-y border-earth-100">
      <div className="max-w-7xl mx-auto px-4 py-12 md:py-16 flex flex-wrap justify-center gap-y-10 md:divide-x md:divide-earth-200">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
            className="w-1/2 md:w-auto md:flex-1 px-4 text-center"
          >
            <p className="flex items-center justify-center gap-1.5 font-serif lining-nums text-4xl md:text-5xl text-earth-900 tracking-tight">
              {stat.value}
              {stat.star && <Star size={28} className="fill-earth-800 text-earth-800" />}
            </p>
            <p className="mt-2 text-sm text-earth-500">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
