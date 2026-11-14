"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ArrowRight, CalendarDays } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { CartLineList } from "@/components/booking/cart-line-list";

/**
 * The cart button for the header (desktop; sits next to the language flag) and
 * the one cart review dialog on every width: selected houses + total + proceed.
 * On phones the button is hidden and the sticky MobileBookingBar's cart tile
 * opens this same dialog through the `open-cart` event, so both widths show the
 * cart the same way. Icon colour follows the header's scrolled state.
 */
export function HeaderCart({ scrolled }: { scrolled: boolean }) {
  const cart = useBookingCartOptional();
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const cartCount = cart?.lines.length ?? 0;
  const subtotal = cart?.subtotal ?? 0;
  const nights = cart?.nights ?? 0;
  const dateRange = cart?.dateRange;
  const hasCart = cartCount > 0;

  // `open-cart` comes from "ดูรายการจอง" on the add-to-cart toast and from the phone bar's cart tile.
  useEffect(() => {
    const openCart = () => setOpen(true);
    document.addEventListener("open-cart", openCart);
    return () => document.removeEventListener("open-cart", openCart);
  }, []);

  // Editing a line reopens the room config dialog (RoomsSection dispatches
  // `edit-line`); close this review so the two dialog layers don't overlap.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("edit-line", close);
    return () => document.removeEventListener("edit-line", close);
  }, [open]);

  if (!cart) return null;

  const handleContinue = () => {
    setOpen(false);
    setTimeout(
      () => document.getElementById("booking-card")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150,
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={cartCount > 0 ? `${tb("yourCart")} · ${tb("roomsCount", { count: cartCount })}` : tb("yourCart")}
        className={`relative hidden cursor-pointer items-center justify-center rounded-full p-2 transition-colors md:inline-flex ${
          scrolled ? "text-[#111111] hover:bg-black/5" : "text-white hover:bg-white/10"
        }`}
      >
        <ShoppingCart size={20} />
        {cartCount > 0 && (
          // `cart-badge-pulse` keyframes live in globals.css (shared with the
          // mobile bar) and self-disable under prefers-reduced-motion.
          <span className="cart-badge-pulse absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F83858] px-1 text-xs font-bold leading-none text-white ring-2 ring-white">
            {cartCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tb("reviewCart")}</DialogTitle>
          </DialogHeader>

          {dateRange?.from && dateRange?.to && (
            <div className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-sm text-ink-2">
              <CalendarDays size={14} className="text-ink-3" />
              {/* Day first, as Thai (and British) dates read: 20 พ.ย. – 21 พ.ย. 2569. */}
              {fmtDate(dateRange.from, "d MMM", locale)} – {fmtDate(dateRange.to, "d MMM yyyy", locale)}
              <span className="ml-auto text-xs text-ink-3">{nights} {nights > 1 ? tc("nights") : tc("night")}</span>
            </div>
          )}

          {hasCart ? (
            <CartLineList className="max-h-72 overflow-y-auto pr-1" />
          ) : (
            <div className="rounded-xl border border-dashed border-line-strong bg-mist p-6 text-center text-sm text-ink-2">
              {tb("emptyCart")}
            </div>
          )}

          {hasCart && (
            <>
              <div className="flex items-center justify-between border-t border-line pt-3 text-base font-bold text-ink">
                <span>{tc("total")}</span>
                <span>฿{subtotal.toLocaleString()}</span>
              </div>
              <Button
                className="w-full rounded-full bg-pine px-6 py-3.5 h-auto text-sm font-bold text-white hover:bg-pine-hover"
                onClick={handleContinue}
              >
                {tb("proceedBooking")} <ArrowRight size={16} className="ml-1" />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
