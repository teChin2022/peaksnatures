"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { HomestayCard } from "./homestay-card";

const PAGE_SIZE = 50;

interface HomestayData {
  slug: string;
  name: string;
  location: string;
  hero_image_url: string | null;
  gallery: string[];
  min_price: number | null;
  max_guests: number;
  tagline: string | null;
  review_count: number;
  average_rating: number;
  is_host_verified: boolean;
}

export function UniqueHomestays({ homestays, locationFilter }: { homestays: HomestayData[]; locationFilter?: string }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevFilter, setPrevFilter] = useState(locationFilter);

  // Reset paging when the hero search term changes
  if (prevFilter !== locationFilter) {
    setPrevFilter(locationFilter);
    setVisibleCount(PAGE_SIZE);
  }

  const filtered = locationFilter
    ? homestays.filter((h) => {
        const q = locationFilter.toLowerCase();
        return h.name.toLowerCase().includes(q) || h.location.toLowerCase().includes(q);
      })
    : homestays;

  const displayed = filtered.slice(0, visibleCount);
  const remaining = filtered.length - displayed.length;

  return (
    <section id="unique-homestays" className="py-24 md:py-32 bg-section-alt">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col items-center mb-12 gap-6 text-center">
          <div className="max-w-xl">
            <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400 block mb-4">
              ที่พักที่คัดสรรแล้ว
            </span>
            <div className="overflow-hidden pt-2 -mt-2">
              <motion.h2
                initial={{ y: "100%" }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                className="text-3xl md:text-5xl lg:text-6xl font-serif text-earth-900 tracking-tight"
              >
                โฮมสเตย์กลางธรรมชาติ
              </motion.h2>
            </div>
          </div>
        </div>

        {displayed.length > 0 ? (
          <>
            {/* Mobile: horizontal scroll carousel */}
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4 scrollbar-hide sm:hidden">
              {displayed.map((h, idx) => (
                <motion.div
                  key={h.slug}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: (idx % 3) * 0.08, duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
                  className="snap-start shrink-0 w-[82vw]"
                >
                  <HomestayCard
                    slug={h.slug}
                    name={h.name}
                    location={h.location}
                    heroImageUrl={h.hero_image_url}
                    gallery={h.gallery}
                    minPrice={h.min_price}
                    maxGuests={h.max_guests}
                    tagline={h.tagline}
                    reviewCount={h.review_count}
                    averageRating={h.average_rating}
                    isHostVerified={h.is_host_verified}
                  />
                </motion.div>
              ))}
            </div>

            {/* Desktop: grid */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {displayed.map((h, idx) => (
                <motion.div
                  key={h.slug}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ delay: (idx % 3) * 0.1, duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
                >
                  <HomestayCard
                    slug={h.slug}
                    name={h.name}
                    location={h.location}
                    heroImageUrl={h.hero_image_url}
                    gallery={h.gallery}
                    minPrice={h.min_price}
                    maxGuests={h.max_guests}
                    tagline={h.tagline}
                    reviewCount={h.review_count}
                    averageRating={h.average_rating}
                    isHostVerified={h.is_host_verified}
                  />
                </motion.div>
              ))}
            </div>

            {remaining > 0 && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="group inline-flex items-center gap-2 rounded-full border border-earth-300 bg-white px-10 py-4 text-sm font-bold uppercase tracking-[0.15em] text-earth-900 shadow-sm transition-all hover:border-earth-400 hover:bg-earth-50"
                >
                  โหลดเพิ่มเติม
                  <span className="font-normal normal-case tracking-normal text-earth-500">
                    (อีก {remaining} แห่ง)
                  </span>
                  <ChevronDown size={16} className="transition-transform group-hover:translate-y-0.5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-earth-200 py-16 text-center">
            <p className="text-lg font-serif text-earth-500">
              {locationFilter ? "ไม่พบที่พักที่ตรงกับการค้นหา" : "No homestays listed yet"}
            </p>
            <p className="mt-2 text-sm text-earth-400">
              {locationFilter ? "ลองค้นหาด้วยคำอื่น" : "Check back soon — new properties are being added."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
