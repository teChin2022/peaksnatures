"use client";

import { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Users, ListPlus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import type { Room } from "@/types/database";
import { composeTierLabel, hasDefaultPriceTier, resolveGuestPricing } from "@/lib/guest-pricing";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { fmtDate } from "@/lib/format-date";
import { useBookingCart, type CartLine } from "@/components/booking/booking-cart-context";

/**
 * Quick-config popup shown when a guest taps "เลือกบ้านพักนี้" on a house card
 * (or books a house from the availability calendar), or "edit" on a chosen line.
 * Collects guests (tier or stepper) + add-ons (+ quantity when adding) and shows
 * the price for the shared dates. Adding has two ends, since the page has no
 * cart: "จองเลย" goes straight to the guest details with every chosen house,
 * "เลือกบ้านพักหลังอื่นเพิ่ม" keeps the house chosen and goes back to the list.
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
  const { catalog, dateRange, nights, computeLineGross, addLine, updateLine, remainingForRoom, lines, subtotal } = cart;
  // Set when an add hands focus elsewhere (the checkout, or the house list), so closing must not return it to the card.
  const handedOffRef = useRef(false);
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
  // A new house starts on the host's "ใช้ราคาปกติ" tier, so จองเลย is never greyed out
  // by a choice the guest did not know they had to make. Stepper mode starts with none.
  const [tierIds, setTierIds] = useState<string[]>(() => {
    if (editingLine) return editingLine.tierIds;
    const base = hasBaseTier ? tiers.find((t) => t.surcharge === 0) : undefined;
    return base ? [base.id] : [];
  });
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

  const fields = room ? { roomId: room.id, numGuests: resolvedGuests, tierIds, optionIds } : null;
  // Houses already chosen (other lines). The dialog prices only this one, so it adds the grand total.
  const otherCount = isEditing ? 0 : lines.length;
  const houseCount = otherCount + qty;

  /** Adds `qty` lines for this house and returns the first one's id. */
  const addLines = () => {
    const ids = Array.from({ length: qty }, () => crypto.randomUUID());
    for (const lineId of ids) addLine({ lineId, ...fields! });
    return ids[0];
  };

  const handleSave = () => {
    if (!canAdd || !editingLine || !fields) return;
    updateLine(editingLine.lineId, fields);
    onClose();
  };

  const handleBookNow = () => {
    if (!canAdd || !fields) return;
    addLines();
    handedOffRef.current = true;
    onClose();
    // Next task, so the new lines are committed: the checkout's handler reads the chosen houses (booking-section).
    setTimeout(() => document.dispatchEvent(new Event("proceed-booking")), 0);
  };

  const handleChooseMore = () => {
    if (!room || !canAdd || !fields) return;
    const lineId = addLines();
    handedOffRef.current = true;
    toast.success(t("addedToast", { name: room.name }));
    // RoomsSection shows the other houses (or focuses this new line when all are shown already).
    document.dispatchEvent(new CustomEvent("house-chosen", { detail: { lineId, more: true } }));
    onClose();
  };

  return (
    <Dialog open={open && !!room} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] gap-0 p-0 flex flex-col"
        onCloseAutoFocus={(e) => {
          if (handedOffRef.current) e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-3 pr-12 text-left">
          <DialogTitle>{room?.name}</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4">
          {/* Guests */}
          <div className="space-y-2">
            <label className="text-[13px] font-semibold text-ink-3">{t("numGuests")}</label>
            {hasBaseTier ? (
              <div className="space-y-2">
                {tiers.map((tier) => {
                  const isSel = tier.id === tierIds[0];
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => setTierIds([tier.id])}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSel ? "border-pine bg-pine/5" : "border-line hover:border-line-strong"}`}
                    >
                      <Users size={16} className="shrink-0 text-ink-3" />
                      <span className="flex-1 min-w-0 text-sm font-medium text-ink">{composeTierLabel(tier, locale)}</span>
                      {/* Base tier states the rate itself (no "+"); the rest are per-night
                          deltas on top of it, so they keep the "+" and the brand colour. */}
                      {tier.surcharge > 0 ? (
                        <span className="shrink-0 text-xs font-semibold text-pine whitespace-nowrap">
                          +฿{tier.surcharge.toLocaleString()}/{tc("night")}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-semibold text-ink whitespace-nowrap">
                          ฿{baseNightlyPrice.toLocaleString()}/{tc("night")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl border border-line">
                <span className="text-sm font-medium text-ink-2">{numGuests} {tc("guests")}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={tc("decrease")}
                    disabled={numGuests <= 1}
                    onClick={() => setNumGuests((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-3 transition-colors hover:bg-mist-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Minus size={18} /></button>
                  <button
                    type="button"
                    aria-label={tc("increase")}
                    disabled={numGuests >= maxGuests}
                    onClick={() => setNumGuests((n) => Math.min(maxGuests, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-3 transition-colors hover:bg-mist-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Plus size={18} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Guest-composition extras — the tier list when it has no "ใช้ราคาปกติ" row.
              Every row here costs extra by definition, so they stack like add-ons. */}
          {!hasBaseTier && tiers.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-ink-3 flex items-center gap-1.5"><Users size={14} /> {t("guestPricing")}</label>
              {tiers.map((tier) => {
                const checked = tierIds.includes(tier.id);
                return (
                  <label key={tier.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? "border-pine bg-pine/5" : "border-line hover:border-line-strong"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setTierIds((prev) => (checked ? prev.filter((id) => id !== tier.id) : [...prev, tier.id]))}
                      className="h-5 w-5 rounded border-line-strong text-pine focus:ring-pine"
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-ink">{composeTierLabel(tier, locale)}</span>
                    <span className="text-xs font-semibold text-pine whitespace-nowrap">+฿{tier.surcharge.toLocaleString()}/{tc("night")}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Add-ons */}
          {options.length > 0 && (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-ink-3 flex items-center gap-1.5"><ListPlus size={14} /> {t("options")}</label>
              {options.map((o) => {
                const checked = optionIds.includes(o.id);
                return (
                  <label key={o.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checked ? "border-pine bg-pine/5" : "border-line hover:border-line-strong"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setOptionIds((prev) => (checked ? prev.filter((id) => id !== o.id) : [...prev, o.id]))}
                      className="h-5 w-5 rounded border-line-strong text-pine focus:ring-pine"
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-ink">{o.name}</span>
                    <span className="text-xs font-semibold text-pine">+฿{o.price.toLocaleString()}{o.pricing_type === "per_time" ? tc("perStay") : `/${tc("night")}`}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Quantity — only when adding and more than one of this room is available */}
          {!isEditing && maxQty > 1 && (
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-ink-3">{t("quantity")}</label>
              <div className="flex items-center justify-between p-3 rounded-xl border border-line">
                <span className="text-sm font-medium text-ink-2">{qty}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={tc("decrease")}
                    disabled={qty <= 1}
                    onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-3 transition-colors hover:bg-mist-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Minus size={18} /></button>
                  <button
                    type="button"
                    aria-label={tc("increase")}
                    disabled={qty >= maxQty}
                    onClick={() => setQuantity((n) => Math.min(maxQty, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-3 transition-colors hover:bg-mist-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  ><Plus size={18} /></button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pinned footer: price + CTA (always reachable, never scrolls off) */}
        <div className="border-t border-line px-6 py-4 space-y-3">
          {nights > 0 && (!hasBaseTier || selectedTier) && (
            <div className="space-y-0.5">
              {!isEditing && qty > 1 && (
                <p className="flex items-center justify-between text-xs text-ink-3">
                  <span>฿{unitPrice.toLocaleString()} × {qty}</span>
                </p>
              )}
              <div className="flex items-center justify-between text-base font-bold text-ink">
                {/* With other houses chosen, this price is for this house only; the grand total follows. */}
                <span>{otherCount > 0 ? t("thisHouse") : tc("total")}</span>
                <span>฿{(unitPrice * (isEditing ? 1 : qty)).toLocaleString()}</span>
              </div>
              {/* The stay the total is for, so the price never floats free of its dates (B16). */}
              {dateRange?.from && dateRange?.to && (
                <p className="text-right text-[13px] text-ink-2">
                  {fmtDate(dateRange.from, "d MMM", locale)} – {fmtDate(dateRange.to, "d MMM", locale)} · {nights} {nights > 1 ? tc("nights") : tc("night")}
                </p>
              )}
              {otherCount > 0 && (
                <p className="mt-2 flex items-center justify-between border-t border-dashed border-line-strong pt-2 text-sm text-ink-2">
                  <span>{t("allHousesTotal", { count: houseCount })}</span>
                  <span className="text-base font-bold text-ink">฿{(subtotal + unitPrice * qty).toLocaleString()}</span>
                </p>
              )}
            </div>
          )}
          {isEditing ? (
            <Button
              disabled={!canAdd}
              onClick={handleSave}
              className="w-full rounded-full bg-pine px-6 py-3.5 h-auto text-sm font-bold text-white hover:bg-pine-hover disabled:opacity-50"
            >
              {tc("save")}
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button
                disabled={!canAdd}
                onClick={handleBookNow}
                className="w-full rounded-full bg-pine px-6 py-3.5 h-auto text-sm font-bold text-white hover:bg-pine-hover disabled:opacity-50"
              >
                {houseCount > 1 ? t("bookNowCount", { count: houseCount }) : tc("bookNow")}
              </Button>
              <Button
                disabled={!canAdd}
                onClick={handleChooseMore}
                className="w-full rounded-full border border-line-strong bg-white px-6 py-3.5 h-auto text-sm font-bold text-ink shadow-none hover:bg-mist disabled:opacity-50"
              >
                {t("chooseAnotherHouse")}
              </Button>
            </div>
          )}
          {hasBaseTier && !selectedTier && (
            <p className="text-center text-xs text-ink-3">{t("selectGuestsForPrice")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
