"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";

export function LandingExperience() {
  return (
    <section id="experience" className="py-24 bg-zinc-100 text-zinc-900 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            className="relative"
          >
            <div className="aspect-[4/5] rounded-[3rem] overflow-hidden shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=1000"
                alt="Hiking Experience"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-white rounded-[2rem] p-8 hidden md:flex flex-col justify-center border border-zinc-200 shadow-2xl backdrop-blur-xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">
                Upcoming Event
              </span>
              <h4 className="text-xl font-serif mb-2 text-zinc-900">
                Midnight Stargazing
              </h4>
              <p className="text-sm text-zinc-600">
                Join our resident astronomer for a journey through the cosmos.
              </p>
            </div>
          </motion.div>

          <div className="space-y-8">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 block">
              Beyond the Stay
            </span>
            <h2 className="text-4xl md:text-6xl font-serif leading-tight text-zinc-900">
              Crafting your <span className="italic">Wilderness Story</span>
            </h2>
            <p className="text-zinc-600 text-lg leading-relaxed">
              We don&apos;t just provide a place to sleep. We provide a gateway
              to experiences that linger in the soul long after you&apos;ve
              returned home.
            </p>

            <div className="grid gap-6 pt-8">
              {[
                "Alpine Trekking",
                "Forest Bathing",
                "Local Gastronomy",
                "Artisan Workshops",
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-4 border-b border-zinc-200 group cursor-pointer"
                >
                  <span className="text-xl font-serif group-hover:translate-x-4 transition-transform text-zinc-800">
                    {item}
                  </span>
                  <ChevronRight className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
