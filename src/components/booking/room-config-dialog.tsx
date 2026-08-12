"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Users, ListPlus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { Room } from "@/types/database";
import { composeTierLabel, hasDefaultPriceTier, resolveGuestPricing } from "@/lib/guest-pricing";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { useBookingCart, type CartLine } from "@/components/booking/booking-cart-context";

/**
 * Quick-config popup shown when a guest taps "Add to cart" on a room card, or
 * "Edit" on a cart line. Collects guests (tier or stepper) + add-ons (+ quantity
 * when adding), shows the price for the shared dates, and adds/updates the cart.
 * When `editingLine` is passed the dialog updates that line instead of adding.
 *
 * The guest section has two shapes, decided by whether the host defined a
 * "ใช้ราคาปกติ" tier (see `hasDefaultPriceTier`). With one, the tier list is a
 * complete set of alternatives and stands in for the picker. Without one, every
 * tier costs extra, so the stepper supplies the base party and the tiers drop to
 * an optional multi-select section whose surcharges stack.
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
  const { catalog, dateRange, nights, computeLineGross, addLine, updateLine, remainingForRoom } = cart;
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const isEditing = !!editingLine;

  const tiers = useMemo(
    () => (room ? catalog.guestPricing.filter((g) => g.room_id === room.id).sort((a, b) => a.sort_order - b.sort_order) : []),
    [room, catalog.guestPricing],
  );
  // A "ใช้ราคาปกติ" row makes the list a complete picker; without one it is only add-ons.
  const hasBaseTier = hasDefaultPriceTier(tiers);

  // The dialog is remounted per room / per edited line (keyed at the call site),
  // so these initial values apply cleanly when a different target is opened.
  const [numGuests, setNumGuests] = useState(() => {
    if (!editingLine) return 2;
    if (hasBaseTier) return 2; // stepper is hidden in this mode; the tier sets the headcount
    // A line's numGuests is the RESOLVED headcount — in stepper mode that is
    // stepper + ticked tiers. Peel the tiers back off to recover the stepper value;
    // seeding it raw would double-count the extras on every re-save.
    const extras = tiers
      .filter((t) => editingLine.tierIds.includes(t.id))
      .reduce((s, t) => s + t.adults + t.children, 0);
    return Math.max(1, editingLine.numGuests - extras);
  });
  const [tierIds, setTierIds] = useState<string[]>(editingLine?.tierIds ?? []);
  const [optionIds, setOptionIds] = useState<string[]>(editingLine?.optionIds ?? []);
  const [quantity, setQuantity] = useState(1);

  const options = useMemo(
    () => (room ? catalog.roomOptions.filter((o) => o.room_id === room.id) : []),
    [room, catalog.roomOptions],
  );
  const selectedTier = hasBaseTier ? tiers.find((g) => g.id === tierIds[0]) || null : null;

  // Nightly rate a "use default price" tier (surcharge 0) is charged: the special or
  // seasonal rate for the check-in night, or the room's base rate before dates are picked.
  // Mirrors booking-section's defaultTierNightlyPrice so both surfaces quote the same number.
  const baseNightlyPrice = useMemo(() => {
    if (!room) return 0;
    if (!dateRange?.from || !dateRange?.to || nights < 1) return room.price_per_night;
    const seasons = catalog.seasonalPrices.filter((s) => s.room_id === room.id);
    const specialPrices = catalog.specialPrices.filter((s) => s.room_id === room.id);
    return (
      calculateTotalPrice({
        basePricePerNight: room.price_per_night,
        checkIn: dateRange.from,
        checkOut: dateRange.to,
        seasons,
        specialPrices,
      }).breakdown[0]?.price
      ?? room.price_per_night
    );
  }, [room, dateRange, nights, catalog.seasonalPrices, catalog.specialPrices]);

  // When adding, cap quantity to how many more of this room may still be added.
  // When editing, quantity is irrelevant (we modify the existing line in place).
  const maxQty = room ? (isEditing ? 1 : Math.max(1, remainingForRoom(room))) : 1;
  const qty = Math.min(quantity, maxQty);

  const resolvedGuests = resolveGuestPricing(tiers, tierIds, numGuests, locale).numGuests;

  const draftLine: CartLine | null = room
    ? { lineId: "draft", roomId: room.id, numGuests: resolvedGuests, tierIds, optionIds }
    : null;
  const unitPrice = draftLine ? computeLineGross(draftLine) : 0;
  // Only a base-tier list is mandatory — the optional add-on list never blocks adding.
  const canAdd = !!room && nights > 0 && (!hasBaseTier || tierIds.length === 1);
  const maxGuests = room?.max_guests || 99;

  const handleSubmit = () => {
    if (!room || !canAdd) return;
    const fields = { roomId: room.id, numGuests: resolvedGuests, tierIds, optionIds };
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
            {hasBaseTier ? (
              <div className="space-y-2">
                {tiers.map((tier) => {
                  const isSel = tier.id === tierIds[0];
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setTierIds([tier.id])}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSel ? "border-brand bg-brand/5" : "border-earth-200 hover:border-earth-300"}`}
                    >
                      <Users size={16} className="shrink-0 text-earth-400" />
                      <span className="flex-1 min-w-0 text-sm font-medium text-earth-900">{composeTierLabel(tier, locale)}</span>
                      {/* Base tier states the rate itself (no "+"); the rest are per-night
                          deltas on top of it, so they keep the "+" and the brand colour. */}
                      {tier.surcharge > 0 ? (
                        <span className="shrink-0 text-xs font-semibold text-brand whitespace-nowrap">
                          +฿{tier.surcharge.toLocaleString()}/{tc("night")}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-semibold text-earth-900 whitespace-nowrap">
                          ฿{baseNightlyPrice.toLocaleString()}/{tc("night")}
                        </span>
                      )}
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

          {/* Guest-composition extras — the tier list when it has no "ใช้ราคาปกติ" row.
              Every row here costs extra by definition, so they stack like add-ons. */}
          {!hasBaseTier && tiers.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold uppercase tracking-[0.15em] text-earth-400 flex items-center gap-1.5"><Users size={14} /> {t("guestPricing")}</label>
              {tiers.map((tier) => {
                const checked = tierIds.includes(tier.id);
                return (
                  <label key={tier.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? "border-brand bg-brand/5" : "border-earth-200 hover:border-earth-300"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setTierIds((prev) => (checked ? prev.filter((id) => id !== tier.id) : [...prev, tier.id]))}
                      className="h-5 w-5 rounded border-earth-300 text-brand focus:ring-brand"
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-earth-900">{composeTierLabel(tier, locale)}</span>
                    <span className="text-xs font-semibold text-brand whitespace-nowrap">+฿{tier.surcharge.toLocaleString()}/{tc("night")}</span>
                  </label>
                );
              })}
            </div>
          )}

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
          {nights > 0 && (!hasBaseTier || selectedTier) && (
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
            className="w-full rounded-full bg-brand px-6 py-3.5 h-auto text-sm font-bold uppercase tracking-widest text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {isEditing ? (
              tc("save")
            ) : (
              <><Plus size={16} className="mr-1" /> {t("addToCart")}</>
            )}
          </Button>
          {hasBaseTier && !selectedTier && (
            <p className="text-center text-xs text-earth-400">{t("selectGuestsForPrice")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
