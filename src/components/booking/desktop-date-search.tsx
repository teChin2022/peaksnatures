"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useTranslations, useLocale } from "next-intl";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";

/**
 * The date panel that straddles the bottom of the /book hero: check-in,
 * check-out and the length of the stay as large fields, and one button. Every
 * field opens the shared calendar (cart date range); the button jumps to the
 * date-filtered houses, or opens the calendar first if no dates are chosen.
 * Shown on every width; the phone's sticky bar keeps its own date CTA. Hidden
 * when the host can't take bookings or has no house.
 */
export function DesktopDateSearch({ bookingDisabled = false }: { bookingDisabled?: boolean }) {
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

  /** A date as a large day number beside its month and weekday, or the "select a date" prompt. */
  const dateValue = (d: Date | undefined) =>
    d ? (
      <span className="flex items-center gap-2.5">
        <span className="font-serif text-4xl leading-none text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
          {fmtDate(d, "d", locale)}
        </span>
        <span className="text-[13px] leading-tight text-ink-2">
          {fmtDate(d, "MMMM", locale)}
          <br />
          {fmtDate(d, "EEEE", locale)}
        </span>
      </span>
    ) : (
      <span className="text-base text-ink-3">{tb("selectDates")}</span>
    );

  const field =
    "flex min-h-[84px] cursor-pointer flex-col justify-center gap-1.5 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-pine";

  return (
    // #date-panel: the bottom bars hide while it is on screen (bar-visibility.ts).
    <div id="date-panel" className="relative z-20">
      {/* No entrance: a task surface stays visible at rest (ui-audit B6). */}
      <motion.div
        className="mx-auto -mt-8 max-w-4xl px-4 sm:px-6 md:-mt-12"
      >
        <div className="grid grid-cols-2 gap-1 rounded-[20px] bg-white p-2 shadow-[0_18px_40px_-18px_rgba(19,38,34,0.35)] md:grid-cols-[1fr_1fr_0.8fr_auto] md:items-center">
          <button type="button" onClick={() => setCalendarOpen(true)} aria-label={`${tb("checkInLabel")} — ${tb("selectDates")}`} className={field}>
            <span className="text-xs font-medium text-ink-2">{tb("checkInLabel")}</span>
            {dateValue(hasDates ? dateRange!.from : undefined)}
          </button>
          <button type="button" onClick={() => setCalendarOpen(true)} aria-label={`${tb("checkOutLabel")} — ${tb("selectDates")}`} // A straight divider: a border on the rounded field would curve with its corners.
            className={`${field} relative before:absolute before:inset-y-3 before:left-0 before:w-px before:bg-line`}>
            <span className="text-xs font-medium text-ink-2">{tb("checkOutLabel")}</span>
            {dateValue(hasDates ? dateRange!.to : undefined)}
          </button>
          {/* Length of stay: its own column from md, a quiet line under the dates on phones. */}
          <div className="col-span-2 flex items-center justify-between border-t border-line px-4 py-3 text-sm md:col-span-1 md:flex-col md:items-start md:justify-center md:gap-1.5 md:border-t-0 md:border-l md:py-0">
            <span className="text-xs font-medium text-ink-2">{tb("stayLength")}</span>
            {hasDates ? (
              <span className="flex items-baseline gap-1.5 text-ink">
                <span className="font-serif text-2xl leading-none md:text-4xl" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                  {nights}
                </span>
                {nights > 1 ? tc("nights") : tc("night")}
              </span>
            ) : (
              <span className="text-ink-3">–</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="col-span-2 min-h-[52px] cursor-pointer rounded-full bg-pine px-8 text-[15px] font-medium whitespace-nowrap text-white transition-colors hover:bg-pine-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 md:col-span-1 md:min-h-14"
          >
            {hasDates ? tb("seeAvailableHouses") : tb("chooseStayDates")}
          </button>
        </div>
      </motion.div>
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={scrollToRooms} />
    </div>
  );
}
