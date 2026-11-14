"use client";

import { useState, useEffect, useRef } from "react";
import { ShoppingCart, ArrowRight, Gift } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format-date";
import { useBookingCartOptional } from "@/components/booking/booking-cart-context";
import { CartLineList } from "@/components/booking/cart-line-list";

/** The referral code a ?promo= link brought (getPromoLinkInfo; data.ts is server only, so not imported). */
export interface CartPromo {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  recommender_name: string | null;
}

/**
 * The cart button for the header (desktop; sits next to the language flag) and
 * the one cart review dialog on every width: selected houses + total + proceed.
 * On phones the button is hidden and the sticky MobileBookingBar's cart tile
 * opens this same dialog through the `open-cart` event, so both widths show the
 * cart the same way. The page has no cart card: "proceed" sends `proceed-booking`
 * and BookingSection opens the guest details. Icon colour follows the header's
 * scrolled state. `promo`: the referral code a ?promo= link brought, if any.
 */
export function HeaderCart({ scrolled, promo = null }: { scrolled: boolean; promo?: CartPromo | null }) {
  const cart = useBookingCartOptional();
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Set by "proceed": the checkout takes focus, so the dialog must not hand it back to its opener.
  const proceedingRef = useRef(false);

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
    proceedingRef.current = true;
    setOpen(false);
    document.dispatchEvent(new Event("proceed-booking"));
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
        <DialogContent
          className="gap-0 rounded-[24px] border-0 p-6 sm:max-w-md"
          onCloseAutoFocus={(e) => {
            if (proceedingRef.current) e.preventDefault();
            proceedingRef.current = false;
          }}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="font-serif text-[26px] leading-tight font-normal text-ink">{tb("reviewCart")}</DialogTitle>
            {dateRange?.from && dateRange?.to && (
              // Day first with its weekday, as the page's date bars read: ศ. 20 พ.ย. – อา. 22 พ.ย.
              <DialogDescription className="text-[15px] text-ink-2">
                {fmtDate(dateRange.from, "EEE d MMM", locale)} – {fmtDate(dateRange.to, "EEE d MMM", locale)}
                {" · "}
                {nights} {nights > 1 ? tc("nights") : tc("night")}
                {hasCart && ` · ${tb("roomsCount", { count: cartCount })}`}
              </DialogDescription>
            )}
          </DialogHeader>

          {promo && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-pine-mist p-3.5">
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden />
              <p className="text-sm leading-snug text-ink">
                <span className="font-semibold">{tb("promoFromLinkBanner", { code: promo.code })}</span>
                {promo.discount_value > 0 &&
                  (promo.discount_type === "percentage"
                    ? tb("promoFromLinkDiscountPct", { value: promo.discount_value })
                    : tb("promoFromLinkDiscountFixed", { value: promo.discount_value.toLocaleString() }))}
                {promo.recommender_name && <span className="text-ink-2">{tb("promoFromLinkRef", { name: promo.recommender_name })}</span>}
              </p>
            </div>
          )}

          {hasCart ? (
            <CartLineList className="mt-5 max-h-72 overflow-y-auto pr-1" />
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-line-strong bg-mist p-6 text-center text-[15px] text-ink-2">
              {tb("emptyCart")}
            </div>
          )}

          {hasCart && (
            <div className="mt-5 border-t border-line pt-4">
              {/* The total outranks every line price: same serif money as the checkout. */}
              <div className="flex items-baseline justify-between gap-4 text-ink">
                <span className="text-[15px] font-medium">{tc("total")}</span>
                <span className="font-serif text-2xl lining-nums tabular-nums">฿{subtotal.toLocaleString()}</span>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                className="mt-4 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-pine px-8 text-[15px] font-medium text-white transition-colors hover:bg-pine-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              >
                {tb("proceedBooking")} <ArrowRight size={18} aria-hidden />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
