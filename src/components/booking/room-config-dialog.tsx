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
 * Quick-config popup shown when a guest taps "Add to cart" on a room card.
 * Collects guests (tier or stepper) + add-ons, shows the price for the shared
 * dates, and adds the room to the cart.
 */
export function RoomConfigDialog({ room, open, onClose }: { room: Room | null; open: boolean; onClose: () => void }) {
  const cart = useBookingCart();
  const { catalog, nights, computeLineGross, addLine } = cart;
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();

  // The dialog is remounted per room (keyed by room id at the call site), so
  // these defaults reset automatically when a different room is opened.
  const [numGuests, setNumGuests] = useState(2);
  const [tierId, setTierId] = useState<string | null>(null);
  const [optionIds, setOptionIds] = useState<string[]>([]);

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

  const draftLine: CartLine | null = room
    ? {
        lineId: "draft",
        roomId: room.id,
        numGuests: selectedTier ? selectedTier.adults + selectedTier.children : numGuests,
        tierId,
        optionIds,
      }
    : null;
  const price = draftLine ? computeLineGross(draftLine) : 0;
  const canAdd = !!room && nights > 0 && (!hasTiers || !!selectedTier);

  const handleAdd = () => {
    if (!room || !canAdd) return;
    addLine({
      lineId: crypto.randomUUID(),
      roomId: room.id,
      numGuests: selectedTier ? selectedTier.adults + selectedTier.children : numGuests,
      tierId,
      optionIds,
    });
    onClose();
  };

  return (
    <Dialog open={open && !!room} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{room?.name}</DialogTitle>
        </DialogHeader>

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
              <div className="flex items-center gap-3">
                <button onClick={() => setNumGuests((n) => Math.max(1, n - 1))} className="p-1 rounded-full border border-earth-200 hover:bg-earth-100 text-earth-400"><Minus size={14} /></button>
                <button onClick={() => setNumGuests((n) => Math.min(room?.max_guests || 99, n + 1))} className="p-1 rounded-full border border-earth-200 hover:bg-earth-100 text-earth-400"><Plus size={14} /></button>
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
                    className="h-4 w-4 rounded border-earth-300 text-brand focus:ring-brand"
                  />
                  <span className="flex-1 min-w-0 text-sm font-medium text-earth-900">{o.name}</span>
                  <span className="text-xs font-semibold text-brand">+฿{o.price.toLocaleString()}{o.pricing_type === "per_time" ? tc("perStay") : `/${tc("night")}`}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Price + Add */}
        {nights > 0 && (!hasTiers || selectedTier) && (
          <div className="flex items-center justify-between border-t border-earth-100 pt-3 text-base font-bold text-earth-900">
            <span>{tc("total")}</span>
            <span>฿{price.toLocaleString()}</span>
          </div>
        )}
        <Button
          disabled={!canAdd}
          onClick={handleAdd}
          className="w-full rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
        >
          <Plus size={16} className="mr-1" /> {t("addToCart")}
        </Button>
        {hasTiers && !selectedTier && (
          <p className="text-center text-xs text-earth-400">{t("selectGuestsForPrice")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
