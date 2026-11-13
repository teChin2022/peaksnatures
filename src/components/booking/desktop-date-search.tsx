"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CalendarDays } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";

/**
 * Desktop-only date + search bar that sits on the boundary between the hero and
 * the section below it (Booking.com pattern — the card straddles the image/white
 * edge). Reads/writes the shared cart date range; the date field opens the
 * calendar and "Search" jumps to the (date-filtered) rooms — or opens the
 * calendar first if no dates are chosen yet. Hidden on mobile (the sticky
 * MobileBookingBar carries dates there) and when the host can't take bookings.
 */
export function DesktopDateSearch({ bookingDisabled = false }: { bookingDisabled?: boolean }) {
  const t = useTranslations("hero");
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const cart = useBookingCartOptional();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const dateRange = cart?.dateRange;
  const nights = cart?.nights ?? 0;
  const roomCount = cart?.catalog.rooms.length ?? 0;
  const hasDates = !!(dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime());

  if (!cart || roomCount === 0 || bookingDisabled) return null;

  const scrollToRooms = () =>
    setTimeout(() => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);

  const handleSearch = () => {
    if (!hasDates) {
      setCalendarOpen(true);
      return;
    }
    document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative z-20 hidden md:block">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
        className="mx-auto -mt-9 max-w-3xl px-4 sm:px-6"
      >
        <div className="flex items-stretch gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/25 ring-1 ring-black/5">
          {/* Date field — opens the shared calendar */}
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            aria-label={tb("selectDates")}
            className="group flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            <CalendarDays size={22} className="shrink-0 text-pine" />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-ink-2">{tb("selectDates")}</span>
              <span className={`truncate text-sm font-bold ${hasDates ? "text-ink" : "text-ink-2"}`}>
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
            className="shrink-0 cursor-pointer rounded-full bg-pine px-10 text-[15px] font-medium text-white transition-colors hover:bg-pine-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-pine/40"
          >
            {t("search")}
          </button>
        </div>
      </motion.div>
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={scrollToRooms} />
    </div>
  );
}
