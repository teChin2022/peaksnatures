"use client";

import { useState, useEffect } from "react";
import { MapPin, Calendar as CalendarIcon, User, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DayPicker, DateRange } from "react-day-picker";
import { format, addDays, startOfToday } from "date-fns";
import "react-day-picker/dist/style.css";

export function LandingHero() {
  const [range, setRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), 1),
    to: addDays(new Date(), 5),
  });
  const [showCalendar, setShowCalendar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <section className="relative h-[85vh] w-full overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=2000"
        alt="Cinematic Mountain View"
        className="absolute inset-0 w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative h-full max-w-7xl mx-auto px-4 flex flex-col items-center justify-center text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-4xl md:text-7xl text-white font-serif mb-8 md:mb-12 leading-tight"
        >
          Reconnect with <br />{" "}
          <span className="italic">Nature&apos;s Luxury</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full max-w-md md:max-w-4xl bg-white/95 backdrop-blur-xl rounded-[2.5rem] md:rounded-full p-1.5 md:p-2 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center relative border border-white/20"
        >
          <div className="flex-1 flex flex-col md:flex-row">
            {/* Location */}
            <div className="flex-1 px-7 py-4 md:py-3 text-left border-b md:border-b-0 md:border-r border-gray-100/50 hover:bg-gray-50/50 transition-colors rounded-t-[2rem] md:rounded-l-full md:rounded-t-none group">
              <div className="flex items-center gap-3">
                <MapPin
                  size={16}
                  className="text-gray-400 group-hover:text-gray-800 transition-colors"
                />
                <div className="flex-1">
                  <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-0.5">
                    Location
                  </label>
                  <input
                    type="text"
                    placeholder="Where are you going?"
                    className="w-full text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Dates & Guests Row for Mobile */}
            <div className="flex flex-row md:contents">
              <div
                className="flex-1 px-7 py-4 md:py-3 text-left border-b md:border-b-0 md:border-r border-gray-100/50 cursor-pointer hover:bg-gray-50/50 transition-colors group"
                onClick={() => setShowCalendar(!showCalendar)}
              >
                <div className="flex items-center gap-3">
                  <CalendarIcon
                    size={16}
                    className="text-gray-400 group-hover:text-gray-800 transition-colors"
                  />
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-0.5">
                      Dates
                    </label>
                    <p
                      className={`text-sm font-semibold ${
                        range?.from ? "text-gray-900" : "text-gray-300"
                      }`}
                    >
                      {range?.from ? format(range.from, "MMM d") : "Add dates"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 px-7 py-4 md:py-3 text-left border-b md:border-b-0 md:border-r border-gray-100/50 hover:bg-gray-50/50 transition-colors group">
                <div className="flex items-center gap-3">
                  <User
                    size={16}
                    className="text-gray-400 group-hover:text-gray-800 transition-colors"
                  />
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-0.5">
                      Guests
                    </label>
                    <p className="text-sm font-semibold text-gray-300">
                      Add guests
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Search Button */}
          <div className="p-1.5 md:p-0 md:pr-1.5">
            <button className="w-full md:w-auto bg-gray-900 text-white px-8 py-4 md:p-5 rounded-2xl md:rounded-full hover:bg-black transition-all shadow-lg flex items-center justify-center gap-3 group">
              <Search
                size={20}
                className="group-hover:scale-110 transition-transform"
              />
              <span className="md:hidden font-bold tracking-widest text-sm">
                SEARCH NOW
              </span>
            </button>
          </div>

          {/* Inline Calendar Popover */}
          <AnimatePresence>
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full mt-4 left-0 right-0 md:left-1/2 md:-translate-x-1/2 bg-white rounded-3xl shadow-2xl p-4 z-50 border border-gray-100 overflow-x-auto"
              >
                <div className="min-w-max">
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    disabled={{ before: startOfToday() }}
                    numberOfMonths={isMobile ? 1 : 2}
                    className="!m-0"
                  />
                </div>
                <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setShowCalendar(false)}
                    className="bg-gray-800 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-gray-900"
                  >
                    Apply
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
