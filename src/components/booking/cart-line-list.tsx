"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import { composeLineGuestLabel } from "@/lib/guest-pricing";

/**
 * Shared cart line list — used by the date-bar cart dialog, the booking panel's
 * step 1, and the mobile cart sheet so the three surfaces stay in sync. Each row
 * shows the house's photo, its guests and options, the line's computed gross and
 * ≥44px "edit" / "remove" text controls (Mist Ridge prototype rows).
 *
 * "Edit" dispatches an `edit-line` document event that RoomsSection listens for
 * to reopen the room config dialog prefilled for that line (same custom-event
 * pattern already used for `book-room` / `cart-count`). Pass `editable={false}`
 * for read-only summaries.
 */
export function CartLineList({
  editable = true,
  className = "",
}: {
  editable?: boolean;
  className?: string;
}) {
  const { lines, catalog, computeLineGross, removeLine } = useBookingCart();
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  if (lines.length === 0) return null;

  return (
    <ul className={`divide-y divide-line ${className}`}>
      {lines.map((line) => {
        const room = catalog.rooms.find((r) => r.id === line.roomId);
        const guestLabel = composeLineGuestLabel(
          catalog.guestPricing.filter((g) => g.room_id === line.roomId),
          line.tierIds,
          line.numGuests,
          tc("guests"),
          locale,
        );
        const gross = computeLineGross(line);
        const isConfirming = confirmRemove === line.lineId;
        return (
          <li key={line.lineId} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
            <div className="relative h-14 w-[72px] overflow-hidden rounded-[10px] bg-mist-2">
              {room?.images?.[0] && <Image src={room.images[0]} alt="" fill sizes="72px" className="object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="truncate font-serif text-[17px] text-ink">{room?.name}</p>
              <p className="text-sm text-ink-2">
                {guestLabel}
                {line.optionIds.length > 0 ? ` · ${t("optionsSelected", { count: line.optionIds.length })}` : ""}
              </p>
              {editable &&
                (isConfirming ? (
                  // Removing asks first, in place: the row says what goes, the guest confirms or keeps it.
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-sm text-ink">{t("removeRoomConfirm")}</span>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(null)}
                      className="min-h-11 text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
                    >
                      {tc("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { removeLine(line.lineId); setConfirmRemove(null); }}
                      className="min-h-11 text-sm font-medium text-red-700 underline underline-offset-4"
                    >
                      {t("removeRoom")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-0.5 flex gap-4">
                    <button
                      type="button"
                      onClick={() => document.dispatchEvent(new CustomEvent("edit-line", { detail: { lineId: line.lineId } }))}
                      className="min-h-11 text-sm font-medium text-pine underline underline-offset-4 hover:text-pine-hover"
                    >
                      {tc("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(line.lineId)}
                      className="min-h-11 text-sm font-medium text-red-700 underline underline-offset-4"
                    >
                      {t("removeRoom")}
                    </button>
                  </div>
                ))}
            </div>
            <span className="text-right font-serif text-xl text-ink lining-nums tabular-nums">฿{gross.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
