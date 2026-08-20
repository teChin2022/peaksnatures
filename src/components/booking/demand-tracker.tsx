"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { useLocale } from "next-intl";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import { DemandEvent } from "@/lib/demand-events";
import { trackDemand, trackDemandOnce } from "@/lib/demand-track";

/** Long enough to shed most crawler and prefetch loads without losing real guests. */
const PAGE_VIEW_DWELL_MS = 2000;

/**
 * How long the sold-out verdict waits for availability to settle.
 *
 * BookingCartProvider seeds `liveBookedRanges` from the server snapshot and
 * then refetches on mount, so a guest who completes a date range in that window
 * would otherwise be judged against stale data. Every availability change
 * restarts this timer, so the verdict is taken once the picture stops moving.
 */
const SOLD_OUT_SETTLE_MS = 600;

/**
 * Renders nothing. Emits the three demand events that need no edits to any
 * existing booking component:
 *
 *   page_view          — on mount, after a short dwell
 *   dates_selected     — whenever a complete check-in/check-out is picked
 *   dates_unavailable  — same moment, when no house can serve that range
 *
 * Dates are the interesting case: BookingCartProvider is the single owner of
 * dateRange for the desktop bar, the mobile bar, the availability calendar, the
 * house cards and the checkout panel, so watching it here covers all five
 * surfaces with one effect.
 *
 * Must be rendered inside BookingCartProvider. It re-renders on every cart
 * change, so the render body stays empty and all work lives in ref-guarded
 * effects.
 */
export function DemandTracker({ homestayId }: { homestayId: string }) {
  const locale = useLocale();
  const { dateRange, nights, catalog, isRoomAvailableForRange } = useBookingCart();
  // Two guards, not one. dates_selected is a fact about what the guest picked
  // and fires immediately; dates_unavailable is a verdict about our inventory
  // that has to survive a later availability refresh. Sharing a single ref made
  // the second one unrevisitable once the first had fired.
  const lastSelectedRef = useRef<string | null>(null);
  const lastSoldOutRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      trackDemandOnce(`page_view:${homestayId}`, {
        homestayId,
        eventType: DemandEvent.PAGE_VIEW,
        locale,
      });
    }, PAGE_VIEW_DWELL_MS);
    return () => clearTimeout(timer);
  }, [homestayId, locale]);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to || nights <= 0) return;

    // Always date-fns, never toISOString(): the site runs in Asia/Bangkok, so
    // UTC serialisation would shift every check-in back a day.
    const checkIn = format(dateRange.from, "yyyy-MM-dd");
    const checkOut = format(dateRange.to, "yyyy-MM-dd");

    const key = `${checkIn}|${checkOut}`;

    if (lastSelectedRef.current !== key) {
      lastSelectedRef.current = key;
      trackDemand({ homestayId, eventType: DemandEvent.DATES_SELECTED, checkIn, checkOut, nights, locale });
    }

    // Already recorded as lost demand for this exact range — nothing to revisit.
    if (lastSoldOutRef.current === key) return;

    // Lost demand: the guest asked for these nights and we have nothing to sell
    // them. catalog.rooms is already filtered to active houses upstream.
    //
    // Deferred rather than judged inline: the cleanup below cancels this on
    // every re-run, so an availability refresh restarts the wait and the
    // verdict is only taken once the data stops changing.
    const timer = setTimeout(() => {
      const soldOut =
        catalog.rooms.length > 0 && catalog.rooms.every((room) => !isRoomAvailableForRange(room));
      if (!soldOut) return;
      lastSoldOutRef.current = key;
      trackDemand({
        homestayId,
        eventType: DemandEvent.DATES_UNAVAILABLE,
        checkIn,
        checkOut,
        nights,
        locale,
      });
    }, SOLD_OUT_SETTLE_MS);

    return () => clearTimeout(timer);
  }, [dateRange, nights, catalog.rooms, isRoomAvailableForRange, homestayId, locale]);

  return null;
}
