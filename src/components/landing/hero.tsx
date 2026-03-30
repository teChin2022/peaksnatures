"use client";

import { useState } from "react";
import Image from "next/image";
import { MapPin, Search } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";

interface LandingHeroProps {
  onSearch?: (location: string) => void;
}

const popularDestinations = ["เชียงใหม่", "น่าน", "เลย", "แม่ฮ่องสอน"];

export function LandingHero({ onSearch }: LandingHeroProps) {
  const [location, setLocation] = useState("");
  const { scrollY } = useScroll();
  const imageY = useTransform(scrollY, [0, 500], [0, 150]);
  const contentOpacity = useTransform(scrollY, [0, 400], [1, 0]);

  const handleSearch = (searchTerm?: string) => {
    const term = searchTerm ?? location;
    if (searchTerm !== undefined) setLocation(term);
    onSearch?.(term);
    document.getElementById("unique-homestays")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative h-[100svh] md:h-[85vh] w-full overflow-hidden hero-mist">
      {/* Parallax image */}
      <motion.div style={{ y: imageY }} className="absolute inset-0">
        <Image
          src="/hero-mountain.jpg"
          alt="Mountain landscape in northern Thailand"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 via-60% to-[#2F5D50]/40" />

      <motion.div
        style={{ opacity: contentOpacity }}
        className="relative h-full max-w-7xl mx-auto px-4 flex flex-col items-center justify-center text-center"
      >
        {/* Heading with blur-to-sharp effect */}
        <motion.h1
          initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0, 1] }}
          className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl text-white font-serif mb-4 md:mb-6 leading-tight tracking-tight"
        >
          พักผ่อนท่ามกลางภูเขา
          <br />
          <span className="italic">และธรรมชาติ</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-lg md:text-xl text-white/80 font-light mb-8 md:mb-12 max-w-2xl"
        >
          ค้นพบโฮมสเตย์ท่ามกลางหมอก ป่า และวิวภูเขาที่สวยงาม
        </motion.p>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.8, ease: [0.25, 0.1, 0, 1] }}
          className="w-full max-w-md md:max-w-2xl bg-white/95 backdrop-blur-xl rounded-[2.5rem] md:rounded-full p-1.5 md:p-2 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center relative border border-white/20"
        >
          <div className="flex-1 px-7 py-4 md:py-3 text-left hover:bg-earth-50/50 transition-colors rounded-t-[2rem] md:rounded-l-full md:rounded-t-none group">
            <div className="flex items-center gap-3">
              <MapPin
                size={16}
                className="text-earth-400 group-hover:text-earth-800 transition-colors"
              />
              <div className="flex-1">
                <label className="block text-[12px] font-semibold uppercase tracking-[0.15em] text-earth-400 mb-0.5">
                  สถานที่
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="คุณกำลังจะไปไหน?"
                  className="w-full text-sm font-semibold text-earth-900 outline-none placeholder:text-earth-300 bg-transparent"
                />
              </div>
            </div>
          </div>

          <div className="p-1.5 md:p-0 md:pr-1.5">
            <button
              onClick={() => handleSearch()}
              className="w-full md:w-auto bg-brand text-white px-8 py-4 md:p-5 rounded-2xl md:rounded-full hover:bg-brand-hover transition-all shadow-lg flex items-center justify-center gap-3 group"
            >
              <Search
                size={20}
                className="group-hover:scale-110 transition-transform"
              />
              <span className="md:hidden font-bold tracking-widest text-sm">
                ค้นหา
              </span>
            </button>
          </div>
        </motion.div>

        {/* Popular destination pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="flex flex-wrap justify-center gap-2 mt-6"
        >
          {popularDestinations.map((dest) => (
            <button
              key={dest}
              onClick={() => handleSearch(dest)}
              className="bg-white/15 backdrop-blur-sm text-white text-xs px-4 py-1.5 rounded-full border border-white/10 hover:bg-white/25 transition-colors cursor-pointer"
            >
              {dest}
            </button>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
