"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarDays, ShoppingCart, ArrowRight } from "lucide-react";
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
import { getPriceRange } from "@/lib/calculate-price";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { CartLineList } from "@/components/booking/cart-line-list";
import type { Room, RoomSeasonalPrice } from "@/types/database";

interface MobileBookingBarProps {
  rooms: Room[];
  seasonalPrices: RoomSeasonalPrice[];
  mostBookedRoomId: string | null;
  hasConfirmedBookings: boolean;
  bookingDisabled?: boolean;
}

type BookingStep = "dates" | "details" | "payment";

export function MobileBookingBar({
  rooms,
  seasonalPrices,
  mostBookedRoomId,
  hasConfirmedBookings,
  bookingDisabled = false,
}: MobileBookingBarProps) {
  const t = useTranslations("common");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const cart = useBookingCartOptional();
  const [visible, setVisible] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>("dates");
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

  const cheapestPrice = useMemo(() => {
    if (!rooms.length) return 0;
    let min = Infinity;
    for (const room of rooms) {
      const seasons = seasonalPrices.filter((s) => s.room_id === room.id);
      const range = getPriceRange(room.price_per_night, seasons);
      if (range.min < min) min = range.min;
    }
    return min;
  }, [rooms, seasonalPrices]);

  const focusedRoom = useMemo(
    () => rooms.find((r) => r.id === mostBookedRoomId) ?? rooms[0],
    [mostBookedRoomId, rooms]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const { step } = (e as CustomEvent<{ step: BookingStep }>).detail;
      setBookingStep(step);
    };
    document.addEventListener("booking-step", handler);
    return () => document.removeEventListener("booking-step", handler);
  }, []);

  // Editing a line happens in the room config dialog (opened by RoomsSection);
  // close the sheet so the two modal layers don't overlap.
  useEffect(() => {
    if (!sheetOpen) return;
    const close = () => setSheetOpen(false);
    document.addEventListener("edit-line", close);
    return () => document.removeEventListener("edit-line", close);
  }, [sheetOpen]);

  // The bar is the primary date picker on mobile, so it stays visible from page
  // load. Only hide it during the checkout steps and once the footer scrolls in.
  useEffect(() => {
    if (!isMobile) return;

    const footerEl = document.querySelector("footer");
    let footerInView = false;

    const updateVisibility = () => {
      setVisible(!footerInView && bookingStep === "dates");
    };

    const footerObserver = new IntersectionObserver(
      ([entry]) => {
        footerInView = entry.isIntersecting;
        updateVisibility();
      },
      { threshold: 0 }
    );

    if (footerEl) footerObserver.observe(footerEl);
    updateVisibility();

    return () => footerObserver.disconnect();
  }, [isMobile, bookingStep]);

  const handleBookNow = () => {
    if (!focusedRoom) return;
    document.dispatchEvent(
      new CustomEvent("book-room", { detail: { roomId: focusedRoom.id } })
    );
  };

  // "Book now" with no dates yet opens the calendar first (no dead scroll).
  const handleAction = () => {
    if (!hasDates) {
      setCalendarOpen(true);
      return;
    }
    handleBookNow();
  };

  const scrollToRooms = () => {
    setTimeout(
      () => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150
    );
  };

  const handleContinue = () => {
    setSheetOpen(false);
    document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!isMobile || !rooms.length) return null;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-40 border-t border-earth-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {/* Row 1 — date selector (opens the shared calendar) */}
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              aria-label={tb("selectDates")}
              className="flex w-full items-center gap-3 border-b border-earth-100 px-4 py-2.5 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand">
                <CalendarDays size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                {hasDates ? (
                  <>
                    <span className="truncate text-sm font-semibold text-earth-900">
                      {fmtDate(dateRange!.from!, "d MMM", locale)} — {fmtDate(dateRange!.to!, "d MMM", locale)}
                    </span>
                    <span className="text-xs text-earth-500">
                      {nights} {nights > 1 ? t("nights") : t("night")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-earth-400">
                      {tb("checkInLabel")} — {tb("checkOutLabel")}
                    </span>
                    <span className="text-sm font-semibold text-earth-400">{tb("addDate")}</span>
                  </>
                )}
              </span>
              <span className="shrink-0 text-xs font-semibold text-brand">{t("edit")}</span>
            </button>

            {/* Row 2 — price / running total + primary action */}
            {hasCart ? (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <span className="block text-lg font-bold leading-tight text-earth-900">
                    ฿{subtotal.toLocaleString()}
                  </span>
                  <span className="block truncate text-xs text-earth-500">
                    {tb("roomsCount", { count: cartCount })} · {nights} {nights > 1 ? t("nights") : t("night")}
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-3 text-sm font-bold uppercase tracking-wider text-white">
                  <ShoppingCart className="h-4 w-4" />
                  {tb("yourCart")}
                </span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex flex-col min-w-0">
                  {hasConfirmedBookings && (
                    <span className="text-[10px] font-bold text-brand uppercase tracking-wider leading-none mb-0.5">
                      {t("mostPopular")}
                    </span>
                  )}
                  <span className="text-lg font-bold text-earth-900">
                    <span className="text-sm font-normal text-earth-500">{t("from")} </span>
                    ฿{cheapestPrice.toLocaleString()}
                    <span className="text-sm font-normal text-earth-500">{t("perNight")}</span>
                  </span>
                </div>
                <Button
                  onClick={handleAction}
                  disabled={bookingDisabled}
                  className="relative shrink-0 bg-brand text-white px-6 py-3 h-auto font-bold text-sm tracking-wider uppercase rounded-full hover:bg-brand-hover border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  {bookingDisabled ? t("unavailable") : t("bookNow")}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared date picker (mobile) */}
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={scrollToRooms} />

      {/* Cart review sheet (mobile) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] gap-0 rounded-t-2xl p-0 md:hidden">
          <SheetHeader className="border-b border-earth-100 pr-12">
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
              <div className="rounded-xl border border-dashed border-earth-300 bg-earth-50 p-6 text-center text-sm text-earth-500">
                {tb("emptyCart")}
              </div>
            )}
          </div>

          {hasCart && (
            <SheetFooter className="border-t border-earth-100">
              <div className="flex items-center justify-between text-base font-bold text-earth-900">
                <span>{t("total")}</span>
                <span>฿{subtotal.toLocaleString()}</span>
              </div>
              <Button className="w-full rounded-full bg-brand text-white hover:bg-brand-hover" onClick={handleContinue}>
                {tb("proceedBooking")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
