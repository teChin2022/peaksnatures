"use client";

import React, { useState } from "react";
import Image from "next/image";
import { MapPin, ShieldCheck, Star, BadgeCheck, CalendarX, CalendarDays } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useTranslations, useLocale } from "next-intl";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";

interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
  location?: string;
  isVerified?: boolean;
  averageRating?: number;
  reviewCount?: number;
  bookingDisabled?: boolean;
}

export function HeroSection({
  name,
  tagline,
  heroImageUrl,
  location,
  isVerified,
  averageRating = 0,
  reviewCount = 0,
  bookingDisabled = false,
}: HeroSectionProps) {
  const t = useTranslations("hero");
  const tc = useTranslations("common");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const cart = useBookingCartOptional();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { scrollY } = useScroll();
  const imageY = useTransform(scrollY, [0, 500], [0, 80]);
  const contentOpacity = useTransform(scrollY, [0, 400], [1, 0]);

  const dateRange = cart?.dateRange;
  const nights = cart?.nights ?? 0;
  const roomCount = cart?.catalog.rooms.length ?? 0;
  const hasDates = !!(dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime());

  // Desktop-only entry point into the shared date picker. On mobile the sticky
  // MobileBookingBar already carries the date selector from page load, so the
  // hero stays a clean full-bleed image there. Hidden when there are no bookable
  // rooms or the host can't take bookings.
  const showDatePill = !!cart && roomCount > 0 && !bookingDisabled;

  const handleCalendarDone = () => {
    // Nudge the guest to the rooms once dates are chosen (same pattern as the bars).
    setTimeout(
      () => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150,
    );
  };

  // "Search" — with no dates, open the picker; with dates, jump to the (date-filtered) rooms.
  const handleSearch = () => {
    if (!hasDates) {
      setCalendarOpen(true);
      return;
    }
    document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <section className="relative h-[70svh] md:h-auto md:aspect-[16/9] md:max-h-[85vh] md:min-h-[520px] w-full overflow-hidden hero-mist">
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
            {showDatePill && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-6 hidden md:block"
              >
                <div className="flex w-full max-w-xl items-stretch gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/25 ring-1 ring-black/5">
                  {/* Date field — opens the shared calendar */}
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(true)}
                    aria-label={tb("selectDates")}
                    className="group flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-4 py-2 text-left transition-colors hover:bg-earth-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <CalendarDays size={22} className="shrink-0 text-brand" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-earth-400">{tb("selectDates")}</span>
                      <span className={`truncate text-sm font-bold ${hasDates ? "text-earth-900" : "text-earth-500"}`}>
                        {hasDates
                          ? `${fmtDate(dateRange!.from!, "d MMM", locale)} — ${fmtDate(dateRange!.to!, "d MMM", locale)} · ${nights} ${nights > 1 ? tc("nights") : tc("night")}`
                          : `${tb("checkInLabel")} — ${tb("checkOutLabel")}`}
                      </span>
                    </span>
                  </button>
                  {/* Search — jumps to the rooms (or opens the calendar if no dates) */}
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="shrink-0 cursor-pointer rounded-xl bg-brand px-8 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    {t("search")}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </section>

      {showDatePill && (
        <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={handleCalendarDone} />
      )}
    </>
  );
}
