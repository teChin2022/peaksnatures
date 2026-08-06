"use client";

import { useState } from "react";
import { X, Pencil } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import { composeLineGuestLabel } from "@/lib/guest-pricing";

/**
 * Shared cart line list — used by the date-bar cart dialog, the booking panel's
 * step 1, and the mobile cart sheet so the three surfaces stay in sync. Each row
 * shows the line's computed gross plus ≥44px edit / remove controls.
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
    <div className={`space-y-2 ${className}`}>
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
          <div key={line.lineId} className="rounded-xl border border-earth-100 bg-white p-3">
            {isConfirming ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-earth-700">{t("removeRoomConfirm")}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(null)}
                    className="rounded-full border border-earth-200 px-3 py-2.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { removeLine(line.lineId); setConfirmRemove(null); }}
                    className="rounded-full bg-red-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-red-600"
                  >
                    {t("removeRoom")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-earth-900">{room?.name}</p>
                  <p className="text-xs text-earth-400">
                    {guestLabel}
                    {line.optionIds.length > 0 ? ` · ${t("optionsSelected", { count: line.optionIds.length })}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <span className="mr-1 text-sm font-semibold text-earth-900">฿{gross.toLocaleString()}</span>
                  {editable && (
                    <>
                      <button
                        type="button"
                        aria-label={tc("edit")}
                        onClick={() => document.dispatchEvent(new CustomEvent("edit-line", { detail: { lineId: line.lineId } }))}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-earth-400 transition-colors hover:bg-earth-100 hover:text-earth-700"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("removeRoom")}
                        onClick={() => setConfirmRemove(line.lineId)}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-earth-400 transition-colors hover:bg-earth-100 hover:text-red-500"
                      >
                        <X size={17} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
