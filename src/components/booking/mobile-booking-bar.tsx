"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/lib/use-is-mobile";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { useBookingBarVisible } from "@/components/booking/use-booking-bar-visible";
import { CartLineList } from "@/components/booking/cart-line-list";
import type { Room } from "@/types/database";

interface MobileBookingBarProps {
  rooms: Room[];
  bookingDisabled?: boolean;
}

const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2";

export function MobileBookingBar({ rooms, bookingDisabled = false }: MobileBookingBarProps) {
  const t = useTranslations("common");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const cart = useBookingCartOptional();
  const visible = useBookingBarVisible(isMobile);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Cart state — read straight from the shared context so the bar always
  // reflects the real cart (count + running total), not a static nightly price.
  const cartCount = cart?.lines.length ?? 0;
  const subtotal = cart?.subtotal ?? 0;
  const nights = cart?.nights ?? 0;
  const dateRange = cart?.dateRange;
  const hasCart = cartCount > 0;
  const hasDates = !!(dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime());

  // "ดูรายการจอง" on the add-to-cart toast opens the sheet (phones only; desktop has the header cart).
  useEffect(() => {
    if (!isMobile) return;
    const open = () => setSheetOpen(true);
    document.addEventListener("open-cart", open);
    return () => document.removeEventListener("open-cart", open);
  }, [isMobile]);

  // Editing a line happens in the room config dialog (opened by RoomsSection);
  // close the sheet so the two modal layers don't overlap.
  useEffect(() => {
    if (!sheetOpen) return;
    const close = () => setSheetOpen(false);
    document.addEventListener("edit-line", close);
    return () => document.removeEventListener("edit-line", close);
  }, [sheetOpen]);

  // Picking dates nudges the guest down to the rooms so they can add one.
  const scrollToRooms = () => {
    setTimeout(
      () => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150
    );
  };

  const handleContinue = () => {
    setSheetOpen(false);
    document.getElementById("booking-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleBrowseRooms = () => {
    setSheetOpen(false);
    scrollToRooms();
  };

  if (!isMobile || !rooms.length) return null;

  // The cart button is icon-only, so it needs an explicit accessible name.
  const cartLabel = cartCount > 0 ? `${tb("yourCart")} · ${tb("roomsCount", { count: cartCount })}` : tb("yourCart");

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
            {/* The cart as its own round tile on the left, the Book button beside it (Mist Ridge prototype).
                Hidden while the date panel or the booking card is on screen (useBookingBarVisible). */}
            <div className={`flex items-center gap-2.5 px-3 py-2.5 ${bookingDisabled ? "opacity-40" : ""}`}>
              {/* Cart — icon + count badge; opens the details sheet */}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                disabled={bookingDisabled}
                aria-label={cartLabel}
                className={`relative flex h-[52px] w-[52px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full border border-line-strong bg-white text-ink transition-colors hover:bg-mist disabled:cursor-not-allowed ${FOCUS_RING}`}
              >
                <ShoppingCart size={24} />
                {cartCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-pine px-1.5 text-xs font-semibold leading-none text-white ring-2 ring-white">
                    {cartCount}
                  </span>
                )}
              </button>

              {/* Primary action — always opens the calendar, so it doubles as the "change my dates"
                  affordance once a range is picked; the dialog's onDone then nudges down to the rooms.
                  Once dates exist they ride along as a second line, which also makes them part of the
                  button's accessible name (settled: the CTA owns the dates). */}
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                disabled={bookingDisabled}
                className={`flex min-h-[52px] flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full bg-pine px-4 text-white transition-colors hover:bg-pine-hover active:bg-pine-hover disabled:cursor-not-allowed ${FOCUS_RING}`}
              >
                <span className="text-[15px] font-medium">{tb("bookHouse")}</span>
                {hasDates && (
                  <span className="whitespace-nowrap text-xs leading-tight text-white/85">
                    {fmtDate(dateRange!.from!, "d MMM", locale)} – {fmtDate(dateRange!.to!, "d MMM", locale)} · {nights}{" "}
                    {nights > 1 ? t("nights") : t("night")}
                  </span>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared date picker (mobile) */}
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={scrollToRooms} />

      {/* Cart review sheet (mobile) — all room details */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] gap-0 rounded-t-2xl p-0 md:hidden [&>button]:-m-3.5 [&>button]:rounded-full [&>button]:p-3.5">
          <SheetHeader className="border-b border-line pr-12">
            <SheetTitle>{tb("reviewCart")}</SheetTitle>
            {dateRange?.from && dateRange?.to && (
              <SheetDescription>
                {fmtDate(dateRange.from, "MMM d", locale)} — {fmtDate(dateRange.to, "MMM d, yyyy", locale)} · {nights} {nights > 1 ? t("nights") : t("night")}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {hasCart ? (
              <CartLineList />
            ) : (
              <div className="rounded-xl border border-dashed border-line-strong bg-mist p-6 text-center">
                <p className="text-sm text-ink-2">{tb("emptyCart")}</p>
                <Button
                  className="mt-4 rounded-full bg-pine text-white hover:bg-pine-hover"
                  onClick={handleBrowseRooms}
                >
                  {tb("viewRooms")}
                </Button>
              </div>
            )}
          </div>

          {hasCart && (
            <SheetFooter className="border-t border-line">
              <div className="flex items-center justify-between text-base font-bold text-ink">
                <span>{t("total")}</span>
                <span>฿{subtotal.toLocaleString()}</span>
              </div>
              <Button className="w-full rounded-full bg-pine px-6 py-3.5 h-auto text-sm font-bold text-white hover:bg-pine-hover" onClick={handleContinue}>
                {tb("proceedBooking")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
