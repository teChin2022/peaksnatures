"use client";

import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { motion } from "motion/react";

interface LandingHeroProps {
  onSearch?: (location: string) => void;
}

export function LandingHero({ onSearch }: LandingHeroProps) {
  const [location, setLocation] = useState("");

  const handleSearch = () => {
    onSearch?.(location);
    document.getElementById("unique-homestays")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative h-[85vh] w-full overflow-hidden">
      <img
        src="/hero-mountain.jpg"
        alt="Cinematic Mountain View"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative h-full max-w-7xl mx-auto px-4 flex flex-col items-center justify-center text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-4xl md:text-7xl text-white font-serif mb-4 md:mb-6 leading-tight"
        >
          พักผ่อนท่ามกลางภูเขา
          <br />
          <span className="italic">และธรรมชาติ</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-lg md:text-xl text-white/80 font-light mb-8 md:mb-12 max-w-2xl"
        >
          ค้นพบโฮมสเตย์ท่ามกลางหมอก ป่า และวิวภูเขาที่สวยงาม
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full max-w-md md:max-w-2xl bg-white/95 backdrop-blur-xl rounded-[2.5rem] md:rounded-full p-1.5 md:p-2 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center relative border border-white/20"
        >
          {/* Location */}
          <div className="flex-1 px-7 py-4 md:py-3 text-left hover:bg-gray-50/50 transition-colors rounded-t-[2rem] md:rounded-l-full md:rounded-t-none group">
            <div className="flex items-center gap-3">
              <MapPin
                size={16}
                className="text-gray-400 group-hover:text-gray-800 transition-colors"
              />
              <div className="flex-1">
                <label className="block text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-0.5">
                  สถานที่
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="คุณกำลังจะไปไหน?"
                  className="w-full text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Search Button */}
          <div className="p-1.5 md:p-0 md:pr-1.5">
            <button
              onClick={handleSearch}
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
      </div>
    </section>
  );
}
