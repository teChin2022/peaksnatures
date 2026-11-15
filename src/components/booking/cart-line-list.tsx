"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import { composeLineGuestLabel } from "@/lib/guest-pricing";

/**
 * The chosen units of one house, shown on that house's card (the page has no
 * cart): each line's guests and options, its price for the stay, and ≥44px
 * "edit" / "remove" text controls. Removing asks first, in place.
 *
 * "Edit" dispatches an `edit-line` document event that RoomsSection listens for
 * to reopen the house config dialog prefilled for that line.
 */
export function CartLineList({ roomId, className = "" }: { roomId: string; className?: string }) {
  const { lines, catalog, computeLineGross, removeLine } = useBookingCart();
  const t = useTranslations("booking");
  const tr = useTranslations("rooms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const mine = lines.filter((l) => l.roomId === roomId);
  if (mine.length === 0) return null;

  const tiers = catalog.guestPricing.filter((g) => g.room_id === roomId);
  const action = "min-h-11 text-sm font-medium underline underline-offset-4";
  // The pressed control is gone after the re-render, so focus lands on what replaced it.
  const focusNext = (selector: string) =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-room-id="${roomId}"] ${selector}`)?.focus());

  return (
    <ul className={`grid gap-2 ${className}`}>
      {mine.map((line) => {
        const guestLabel = composeLineGuestLabel(tiers, line.tierIds, line.numGuests, tc("guests"), locale);
        const isConfirming = confirmRemove === line.lineId;
        return (
          <li key={line.lineId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5 rounded-2xl bg-pine-mist px-3.5 pt-3 pb-0.5">
            <Check className="mt-1 h-4 w-4 text-pine" strokeWidth={2.25} aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-pine-deep">{tr("chosen")}</p>
              <p className="text-sm text-ink-2">
                {guestLabel}
                {line.optionIds.length > 0 ? ` · ${t("optionsSelected", { count: line.optionIds.length })}` : ""}
              </p>
              {isConfirming ? (
                <div className="flex flex-wrap items-center gap-x-5">
                  <p className="mt-1.5 w-full text-sm text-ink">{t("removeRoomConfirm")}</p>
                  <button
                    type="button"
                    data-cancel-remove
                    onClick={() => { setConfirmRemove(null); focusNext(`[data-remove-line="${line.lineId}"]`); }}
                    className={`${action} text-pine hover:text-pine-hover`}
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { removeLine(line.lineId); setConfirmRemove(null); focusNext("[data-room-main], [data-edit-line]"); }}
                    className={`${action} text-red-700`}
                  >
                    {t("removeRoom")}
                  </button>
                </div>
              ) : (
                <div className="flex gap-5">
                  <button
                    type="button"
                    data-edit-line={line.lineId}
                    onClick={() => document.dispatchEvent(new CustomEvent("edit-line", { detail: { lineId: line.lineId } }))}
                    className={`${action} text-pine hover:text-pine-hover`}
                  >
                    {tc("edit")}
                  </button>
                  <button
                    type="button"
                    data-remove-line={line.lineId}
                    onClick={() => { setConfirmRemove(line.lineId); focusNext("[data-cancel-remove]"); }}
                    className={`${action} text-red-700`}
                  >
                    {t("removeRoom")}
                  </button>
                </div>
              )}
            </div>
            <span className="font-serif text-xl text-ink lining-nums tabular-nums">฿{computeLineGross(line).toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
