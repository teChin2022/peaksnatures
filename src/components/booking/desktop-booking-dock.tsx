"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslations, useLocale } from "next-intl";
import { fmtDate } from "@/lib/format-date";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { useBookingBarVisible } from "@/components/booking/use-booking-bar-visible";

/**
 * The desktop counterpart of the phone bar: a floating summary at the bottom of
 * /book — the stay, how many houses are chosen and their total — with the next
 * step as its one button: choose dates, change them, or go on to the booking
 * card. It reads the cart and opens the shared calendar; it writes nothing.
 * Hidden on phones, in checkout, and while the date panel, the booking card or
 * the footer is on screen (useBookingBarVisible).
 */
export function DesktopBookingDock({ bookingDisabled = false }: { bookingDisabled?: boolean }) {
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const cart = useBookingCartOptional();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const enabled = !isMobile && !!cart && cart.catalog.rooms.length > 0 && !bookingDisabled;
  const visible = useBookingBarVisible(enabled);

  if (!cart) return null;

  const dateRange = cart.dateRange;
  const nights = cart.nights;
  const houses = cart.lines.length;
  const hasDates = !!(dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime());

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

  const action = houses > 0 ? tb("proceedBooking") : hasDates ? tb("changeDates") : tb("chooseStayDates");
  const onAction = () => (houses > 0 ? scrollTo("booking-card") : setCalendarOpen(true));

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            data-bottom-bar
            initial={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-x-0 bottom-5 z-40 hidden px-6 md:block"
          >
            <div className="mx-auto flex max-w-4xl items-center gap-4 rounded-full border border-line bg-white py-2.5 pr-2.5 pl-6 shadow-[0_18px_40px_-24px_rgba(19,38,34,0.45)]">
              <p className="min-w-0 flex-1 truncate text-[15px] text-ink-2" aria-live="polite">
                {hasDates ? (
                  <>
                    <span className="font-medium text-ink">
                      {fmtDate(dateRange!.from!, "EEE d MMM", locale)} – {fmtDate(dateRange!.to!, "EEE d MMM", locale)}
                    </span>
                    {" · "}
                    {nights} {nights > 1 ? tc("nights") : tc("night")}
                    {" · "}
                    {houses > 0 ? (
                      <>
                        {tb("roomsCount", { count: houses })}
                        {" · "}
                        <span className="font-serif text-xl text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                          ฿{cart.subtotal.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      tb("noRoomSelected")
                    )}
                  </>
                ) : (
                  tb("selectDatesFirst")
                )}
              </p>
              <button
                type="button"
                onClick={onAction}
                className="min-h-12 shrink-0 cursor-pointer rounded-full bg-pine px-7 text-[15px] font-medium text-white transition-colors hover:bg-pine-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
              >
                {action}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <BookingCalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        onDone={() => setTimeout(() => scrollTo("rooms-section"), 150)}
      />
    </>
  );
}
