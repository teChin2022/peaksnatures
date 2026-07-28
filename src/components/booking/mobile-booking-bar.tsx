"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
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
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { CartLineList } from "@/components/booking/cart-line-list";
import type { Room } from "@/types/database";

interface MobileBookingBarProps {
  rooms: Room[];
  bookingDisabled?: boolean;
}

type BookingStep = "dates" | "details" | "payment";

// Shared focus-visible treatment for the bar's two tap targets (keyboard a11y).
// Inset — the segmented pill clips overflow, so an offset ring would be cut off.
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";

// Shared height + press feedback for both halves of the pill; each zone adds its
// own layout (the date side is a text stack, the cart side is a centred icon).
const ZONE =
  "flex min-h-14 cursor-pointer touch-manipulation items-center transition-colors hover:bg-earth-100 active:bg-earth-100";

export function MobileBookingBar({ rooms, bookingDisabled = false }: MobileBookingBarProps) {
  const t = useTranslations("common");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
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

  // Picking dates nudges the guest down to the rooms so they can add one.
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
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={reduceMotion ? { duration: 0.15 } : { type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-40 border-t border-earth-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {/* Segmented pill: a wide date field on the left, the icon-only cart
                on the right. The date stack keeps a fixed two-line shape so the
                bar never reflows once dates are picked. */}
            <div className="px-3 py-2.5">
              <div className="flex items-stretch overflow-hidden rounded-2xl bg-earth-50 ring-1 ring-earth-200">
                {/* Dates — opens the shared calendar, then scrolls to the rooms.
                    No aria-label: the visible date text is the accessible name. */}
                <button
                  type="button"
                  onClick={() => setCalendarOpen(true)}
                  className={`min-w-0 flex-1 gap-2.5 px-3 py-2 text-left ${ZONE} ${FOCUS_RING}`}
                >
                  <CalendarDays size={20} className="shrink-0 text-brand" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-earth-500">
                      {hasDates
                        ? `${nights} ${nights > 1 ? t("nights") : t("night")}`
                        : `${tb("checkInLabel")} — ${tb("checkOutLabel")}`}
                    </span>
                    <span className={`truncate text-sm font-bold ${hasDates ? "text-earth-900" : "text-earth-500"}`}>
                      {hasDates
                        ? `${fmtDate(dateRange!.from!, "d MMM", locale)} – ${fmtDate(dateRange!.to!, "d MMM", locale)}`
                        : tb("selectDates")}
                    </span>
                  </span>
                </button>

                <span aria-hidden className="my-2 w-px shrink-0 bg-earth-200" />

                {/* Cart — e-commerce icon + count badge; opens the details sheet */}
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  disabled={bookingDisabled}
                  aria-label={cartLabel}
                  className={`w-17 shrink-0 justify-center ${ZONE} ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className="relative text-brand">
                    <ShoppingCart size={26} />
                    {cartCount > 0 && (
                      // Ring matches the pill, not the bar, so the badge sits clean
                      // on earth-50. `cart-badge-pulse` keyframes live in globals.css
                      // and self-disable under prefers-reduced-motion.
                      <span className="cart-badge-pulse [--cart-badge-ring:var(--color-earth-50)] absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F83858] px-1 text-[11px] font-bold leading-none text-white ring-2 ring-earth-50">
                        {cartCount}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared date picker (mobile) */}
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={scrollToRooms} />

      {/* Cart review sheet (mobile) — all room details */}
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
              <div className="rounded-xl border border-dashed border-earth-300 bg-earth-50 p-6 text-center">
                <p className="text-sm text-earth-600">{tb("emptyCart")}</p>
                <Button
                  className="mt-4 rounded-full bg-brand text-white hover:bg-brand-hover"
                  onClick={handleBrowseRooms}
                >
                  {tb("viewRooms")}
                </Button>
              </div>
            )}
          </div>

          {hasCart && (
            <SheetFooter className="border-t border-earth-100">
              <div className="flex items-center justify-between text-base font-bold text-earth-900">
                <span>{t("total")}</span>
                <span>฿{subtotal.toLocaleString()}</span>
              </div>
              <Button className="w-full rounded-full bg-brand px-6 py-3.5 h-auto text-sm font-bold uppercase tracking-widest text-white hover:bg-brand-hover" onClick={handleContinue}>
                {tb("proceedBooking")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
