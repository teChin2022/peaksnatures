"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslations, useLocale } from "next-intl";
import { useIsMobile } from "@/lib/use-is-mobile";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { useBookingBarVisible } from "@/components/booking/use-booking-bar-visible";
import { openGuestAi } from "@/components/booking/guest-ai-assistant";
import { MessageCircleQuestion } from "lucide-react";
import type { Room } from "@/types/database";

interface MobileBookingBarProps {
  rooms: Room[];
  bookingDisabled?: boolean;
  /** Shows the guest AI assistant's "ถาม" button on the left (owner, 2026-11-19). */
  guestAiEnabled?: boolean;
}

const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2";

/**
 * The phone's sticky bar, one of two states at the same height (owner, 2026-11-15):
 * nothing chosen yet → one Book button carrying the dates, which opens the
 * calendar; a house chosen for a full stay → the houses, total and dates on the
 * left and "จองเลย" on the right, straight to the guest details. The page has no
 * cart, so this is the way on to checkout; dates change from the date panel or
 * the houses heading's "change dates".
 */
export function MobileBookingBar({ rooms, bookingDisabled = false, guestAiEnabled = false }: MobileBookingBarProps) {
  const t = useTranslations("common");
  const tb = useTranslations("booking");
  const ta = useTranslations("guestAiAsk");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const cart = useBookingCartOptional();
  const visible = useBookingBarVisible(isMobile);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const cartCount = cart?.lines.length ?? 0;
  const nights = cart?.nights ?? 0;
  const dateRange = cart?.dateRange;
  const hasDates = !!(dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime());
  // Chosen houses only count with a full stay: a half-picked range prices nothing.
  const picked = hasDates && cartCount > 0;

  // Picking dates nudges the guest down to the rooms so they can add one.
  const scrollToRooms = () => {
    setTimeout(
      () => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150
    );
  };

  if (!isMobile || !rooms.length) return null;

  const stay = hasDates
    ? `${fmtDate(dateRange!.from!, "d MMM", locale)} – ${fmtDate(dateRange!.to!, "d MMM", locale)} · ${nights} ${nights > 1 ? t("nights") : t("night")}`
    : "";

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            // The cookie notice sits above any element marked so (cookie-consent.tsx).
            data-bottom-bar
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={reduceMotion ? { duration: 0.15 } : { type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-40 rounded-t-[20px] border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {/* Hidden while the date panel, the booking card or the footer is on screen (useBookingBarVisible). */}
            <div className={`flex items-center gap-3 px-3 py-2.5 ${bookingDisabled ? "opacity-40" : ""}`}>
              {guestAiEnabled && (
                // Icon only beside the chosen-house summary, where the row is full (owner, 2026-11-19).
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={picked ? ta("title") : undefined}
                  onClick={openGuestAi}
                  className={`flex min-h-[52px] shrink-0 cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-full border border-line-strong bg-white text-[15px] font-medium text-ink transition-colors hover:bg-mist ${picked ? "w-[52px]" : "px-4"} ${FOCUS_RING}`}
                >
                  <MessageCircleQuestion className="size-[18px] text-pine" aria-hidden />
                  {!picked && ta("barButton")}
                </button>
              )}
              {picked ? (
                <>
                  <div className="min-w-0 flex-1 pl-1" aria-live="polite">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {tb("roomsCount", { count: cartCount })} ·{" "}
                      <span className="font-serif text-lg" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                        ฿{cart!.subtotal.toLocaleString()}
                      </span>
                    </p>
                    <p className="truncate text-[13px] text-ink-2">{stay}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => document.dispatchEvent(new Event("proceed-booking"))}
                    disabled={bookingDisabled}
                    className={`min-h-[52px] min-w-32 shrink-0 cursor-pointer touch-manipulation rounded-full bg-pine px-6 text-[15px] font-medium text-white transition-colors hover:bg-pine-hover active:bg-pine-hover disabled:cursor-not-allowed ${FOCUS_RING}`}
                  >
                    {t("bookNow")}
                  </button>
                </>
              ) : (
                // Nothing chosen yet: the CTA owns the dates and always opens the calendar; its
                // onDone nudges down to the houses. Once picked, the dates ride along as a second line.
                <button
                  type="button"
                  onClick={() => setCalendarOpen(true)}
                  disabled={bookingDisabled}
                  className={`flex min-h-[52px] flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full bg-pine px-4 text-white transition-colors hover:bg-pine-hover active:bg-pine-hover disabled:cursor-not-allowed ${FOCUS_RING}`}
                >
                  <span className="text-[15px] font-medium">{tb("bookHouse")}</span>
                  {hasDates && <span className="whitespace-nowrap text-xs leading-tight text-white/85">{stay}</span>}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared date picker (mobile) */}
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={scrollToRooms} />

    </>
  );
}
