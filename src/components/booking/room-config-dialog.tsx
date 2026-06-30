"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Users, ListPlus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { Room } from "@/types/database";
import { composeTierLabel } from "@/lib/guest-pricing";
import { useBookingCart, type CartLine } from "@/components/booking/booking-cart-context";

/**
 * Quick-config popup shown when a guest taps "Add to cart" on a room card, or
 * "Edit" on a cart line. Collects guests (tier or stepper) + add-ons (+ quantity
 * when adding), shows the price for the shared dates, and adds/updates the cart.
 * When `editingLine` is passed the dialog updates that line instead of adding.
 */
export function RoomConfigDialog({
  room,
  open,
  onClose,
  editingLine = null,
}: {
  room: Room | null;
  open: boolean;
  onClose: () => void;
  editingLine?: CartLine | null;
}) {
  const cart = useBookingCart();
  const { catalog, nights, computeLineGross, addLine, updateLine, remainingForRoom } = cart;
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const isEditing = !!editingLine;

  // The dialog is remounted per room / per edited line (keyed at the call site),
  // so these initial values apply cleanly when a different target is opened.
  const [numGuests, setNumGuests] = useState(editingLine?.numGuests ?? 2);
  const [tierId, setTierId] = useState<string | null>(editingLine?.tierId ?? null);
  const [optionIds, setOptionIds] = useState<string[]>(editingLine?.optionIds ?? []);
  const [quantity, setQuantity] = useState(1);

  const tiers = useMemo(
    () => (room ? catalog.guestPricing.filter((g) => g.room_id === room.id).sort((a, b) => a.sort_order - b.sort_order) : []),
    [room, catalog.guestPricing],
  );
  const options = useMemo(
    () => (room ? catalog.roomOptions.filter((o) => o.room_id === room.id) : []),
    [room, catalog.roomOptions],
  );
  const hasTiers = tiers.length > 0;
  const selectedTier = tiers.find((g) => g.id === tierId) || null;

  // When adding, cap quantity to how many more of this room may still be added.
  // When editing, quantity is irrelevant (we modify the existing line in place).
  const maxQty = room ? (isEditing ? 1 : Math.max(1, remainingForRoom(room))) : 1;
  const qty = Math.min(quantity, maxQty);

  const resolvedGuests = selectedTier ? selectedTier.adults + selectedTier.children : numGuests;

  const draftLine: CartLine | null = room
    ? { lineId: "draft", roomId: room.id, numGuests: resolvedGuests, tierId, optionIds }
    : null;
  const unitPrice = draftLine ? computeLineGross(draftLine) : 0;
  const canAdd = !!room && nights > 0 && (!hasTiers || !!selectedTier);
  const maxGuests = room?.max_guests || 99;

  const handleSubmit = () => {
    if (!room || !canAdd) return;
    const fields = { roomId: room.id, numGuests: resolvedGuests, tierId, optionIds };
    if (isEditing && editingLine) {
      updateLine(editingLine.lineId, fields);
    } else {
      for (let i = 0; i < qty; i++) {
        addLine({ lineId: crypto.randomUUID(), ...fields });
      }
    }
    onClose();
  };

  return (
    <Dialog open={open && !!room} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] gap-0 p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 pr-12 text-left">
          <DialogTitle>{room?.name}</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4">
          {/* Guests */}
          <div className="space-y-2">
            <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("numGuests")}</label>
            {hasTiers ? (
              <div className="space-y-2">
                {tiers.map((tier) => {
                  const isSel = tier.id === tierId;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setTierId(tier.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSel ? "border-brand bg-brand/5" : "border-earth-200 hover:border-earth-300"}`}
                    >
                      <Users size={16} className="shrink-0 text-earth-400" />
                      <span className="flex-1 min-w-0 text-sm font-medium text-earth-900">{composeTierLabel(tier, locale)}</span>
                      {tier.surcharge > 0 && <span className="text-xs font-semibold text-brand">+฿{tier.surcharge.toLocaleString()}</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl border border-earth-200">
                <span className="text-sm font-medium text-earth-700">{numGuests} {tc("guests")}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={tc("decrease")}
                    disabled={numGuests <= 1}
                    onClick={() => setNumGuests((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-earth-200 text-earth-500 transition-colors hover:bg-earth-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Minus size={18} /></button>
                  <button
                    type="button"
                    aria-label={tc("increase")}
                    disabled={numGuests >= maxGuests}
                    onClick={() => setNumGuests((n) => Math.min(maxGuests, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-earth-200 text-earth-500 transition-colors hover:bg-earth-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Plus size={18} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Add-ons */}
          {options.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400 flex items-center gap-1.5"><ListPlus size={14} /> {t("options")}</label>
              {options.map((o) => {
                const checked = optionIds.includes(o.id);
                return (
                  <label key={o.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? "border-brand bg-brand/5" : "border-earth-200 hover:border-earth-300"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setOptionIds((prev) => (checked ? prev.filter((id) => id !== o.id) : [...prev, o.id]))}
                      className="h-5 w-5 rounded border-earth-300 text-brand focus:ring-brand"
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-earth-900">{o.name}</span>
                    <span className="text-xs font-semibold text-brand">+฿{o.price.toLocaleString()}{o.pricing_type === "per_time" ? tc("perStay") : `/${tc("night")}`}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Quantity — only when adding and more than one of this room is available */}
          {!isEditing && maxQty > 1 && (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400">{t("quantity")}</label>
              <div className="flex items-center justify-between p-3 rounded-xl border border-earth-200">
                <span className="text-sm font-medium text-earth-700">{qty}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={tc("decrease")}
                    disabled={qty <= 1}
                    onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-earth-200 text-earth-500 transition-colors hover:bg-earth-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Minus size={18} /></button>
                  <button
                    type="button"
                    aria-label={tc("increase")}
                    disabled={qty >= maxQty}
                    onClick={() => setQuantity((n) => Math.min(maxQty, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-earth-200 text-earth-500 transition-colors hover:bg-earth-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Plus size={18} /></button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pinned footer: price + CTA (always reachable, never scrolls off) */}
        <div className="border-t border-earth-100 px-6 py-4 space-y-3">
          {nights > 0 && (!hasTiers || selectedTier) && (
            <div className="space-y-0.5">
              {!isEditing && qty > 1 && (
                <p className="flex items-center justify-between text-xs text-earth-400">
                  <span>฿{unitPrice.toLocaleString()} × {qty}</span>
                </p>
              )}
              <div className="flex items-center justify-between text-base font-bold text-earth-900">
                <span>{tc("total")}</span>
                <span>฿{(unitPrice * (isEditing ? 1 : qty)).toLocaleString()}</span>
              </div>
            </div>
          )}
          <Button
            disabled={!canAdd}
            onClick={handleSubmit}
            className="w-full rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {isEditing ? (
              tc("save")
            ) : (
              <><Plus size={16} className="mr-1" /> {t("addToCart")}</>
            )}
          </Button>
          {hasTiers && !selectedTier && (
            <p className="text-center text-xs text-earth-400">{t("selectGuestsForPrice")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
