"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Calendar as CalendarIcon, ShoppingCart, ArrowRight } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format-date";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { CartLineList } from "@/components/booking/cart-line-list";

/**
 * Sticky, page-level date selector + cart button shown on the homestay page.
 * Desktop only — on mobile the MobileBookingBar carries the date + cart, so the
 * top space can go to a full-bleed hero. Picks the shared dates (one range for
 * the whole cart), then nudges the guest to the rooms. The cart button opens a
 * review modal where rooms can be removed before heading to checkout.
 */
export function BookingDateBar() {
  const cart = useBookingCart();
  const { dateRange, nights, lines, subtotal } = cart;
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Editing a line reopens the room config dialog (handled by RoomsSection);
  // close this cart modal so the two dialog layers don't overlap.
  useEffect(() => {
    if (!cartOpen) return;
    const close = () => setCartOpen(false);
    document.addEventListener("edit-line", close);
    return () => document.removeEventListener("edit-line", close);
  }, [cartOpen]);

  const handleCalendarDone = () => {
    // Nudge the guest to the rooms once dates are chosen.
    setTimeout(() => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  };

  const handleBook = () => {
    setCartOpen(false);
    setTimeout(() => document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };

  const cartCount = lines.length;
  const hasCheckout = !!(dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime());

  return (
    <>
      <div className="hidden md:block sticky top-0 z-30 border-b border-earth-100 bg-white/95 backdrop-blur-md pt-16">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6 py-3">
          <button
            onClick={() => setCalendarOpen(true)}
            aria-label={t("selectDates")}
            className="group flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-earth-200 bg-white px-3 py-2 text-left transition-all hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
              <CalendarIcon size={18} />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-earth-400">{t("checkInLabel")}</span>
                <span className={`truncate text-sm font-semibold ${dateRange?.from ? "text-earth-900" : "text-earth-400"}`}>
                  {dateRange?.from ? fmtDate(dateRange.from, "d MMM", locale) : t("addDate")}
                </span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-earth-300" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-earth-400">{t("checkOutLabel")}</span>
                <span className={`truncate text-sm font-semibold ${hasCheckout ? "text-earth-900" : "text-earth-400"}`}>
                  {hasCheckout ? fmtDate(dateRange!.to!, "d MMM", locale) : t("addDate")}
                </span>
              </span>
            </span>
            {nights > 0 && (
              <span className="shrink-0 rounded-full bg-earth-100 px-2.5 py-1 text-xs font-semibold text-earth-700">{nights} {nights > 1 ? tc("nights") : tc("night")}</span>
            )}
          </button>

          <button
            onClick={() => setCartOpen(true)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-brand-hover"
          >
            <ShoppingCart size={16} />
            <span className="hidden sm:inline">{t("yourCart")}</span>
            {cartCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Date picker dialog */}
      <BookingCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} onDone={handleCalendarDone} />

      {/* Cart review dialog */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reviewCart")}</DialogTitle>
          </DialogHeader>

          {dateRange?.from && dateRange?.to && (
            <div className="flex items-center gap-2 rounded-xl bg-earth-50 px-3 py-2 text-sm text-earth-700">
              <CalendarDays size={14} className="text-earth-400" />
              {fmtDate(dateRange.from, "MMM d", locale)} — {fmtDate(dateRange.to, "MMM d, yyyy", locale)}
              <span className="ml-auto text-xs text-earth-400">{nights} {nights > 1 ? tc("nights") : tc("night")}</span>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-earth-300 bg-earth-50 p-6 text-center text-sm text-earth-500">
              {t("emptyCart")}
            </div>
          ) : (
            <CartLineList className="max-h-72 overflow-y-auto pr-1" />
          )}

          {lines.length > 0 && (
            <>
              <div className="flex items-center justify-between border-t border-earth-100 pt-3 text-base font-bold text-earth-900">
                <span>{tc("total")}</span>
                <span>฿{subtotal.toLocaleString()}</span>
              </div>
              <Button className="w-full rounded-full bg-brand text-white hover:bg-brand-hover" onClick={handleBook}>
                {t("proceedBooking")} <ArrowRight size={16} className="ml-1" />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
