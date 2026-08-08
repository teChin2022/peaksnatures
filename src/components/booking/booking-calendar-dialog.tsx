"use client";

import { useMemo, useState } from "react";
import { startOfToday, addMonths, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format-date";
import {
  getFullyBookedForRoom,
  firstUnavailableNight,
  makeStayDisabledMatcher,
} from "@/lib/booking-dates";
import { useBookingCart } from "@/components/booking/booking-cart-context";

/**
 * Shared date-range picker dialog for the homestay page. Reads/writes the one
 * shared cart date range. Used by both the desktop date bar and the mobile
 * booking bar. `onDone` fires when the guest confirms a valid range (e.g. to
 * nudge them toward the rooms).
 *
 * Availability is measured in NIGHTS, not days: a stay is half-open
 * `[check-in, check-out)`. So a night that is blocked or booked in every room
 * still works as a CHECK-OUT — the guest leaves in the morning, before the next
 * one arrives. Only starting or sleeping through such a night is refused.
 *
 * A range is only usable at `nights >= 1`. react-day-picker sets from===to on the
 * first tap, so a half-picked range looks "set" but prices nothing — the header
 * below shows which half is still missing, and Done refuses to close until both
 * are picked.
 *
 * `roomId` narrows availability to a single room — pass it when the guest picked
 * a room BEFORE their dates (the availability calendar's "book this house"), so
 * the picker cannot hand back a range that room can't serve. Omit it on the
 * room-agnostic date bars, where any room being free is enough.
 */
export function BookingCalendarDialog({
  open,
  onOpenChange,
  onDone,
  roomId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
  roomId?: string | null;
}) {
  const { dateRange, setDates, nights, catalog, liveBookedRanges } = useBookingCart();
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [warned, setWarned] = useState(false);
  // Set when a tap would have produced a stay running across an unusable night,
  // so the alert below can name the night that blocked it.
  const [crossedNight, setCrossedNight] = useState<string | null>(null);

  // An unknown id falls back to the room-agnostic set rather than to an empty
  // one, so a stale id can never widen the picker into offering booked nights.
  const scopedRoom = roomId ? catalog.rooms.find((r) => r.id === roomId) : undefined;

  /**
   * Nights nobody can sleep in: closed by the host, or fully booked. A blocked
   * night is no more "stayable" than a booked one, so both are equally fine to
   * check out on.
   *
   * Scoped to one room, that is its own blocks (plus the homestay-wide ones) and
   * its own fully-booked nights. Unscoped, a night only counts as unavailable
   * once EVERY room is taken — the date stays selectable while one room is free.
   */
  const unavailableNights = useMemo(() => {
    if (scopedRoom) {
      const blocked = catalog.blockedDates
        .filter((d) => d.room_id === null || d.room_id === scopedRoom.id)
        .map((d) => d.date);
      const booked = getFullyBookedForRoom(scopedRoom.id, scopedRoom.quantity || 1, liveBookedRanges);
      return new Set([...blocked, ...booked]);
    }

    const blocked = catalog.blockedDates.filter((d) => d.room_id === null).map((d) => d.date);
    if (catalog.rooms.length === 0) return new Set(blocked);
    const perRoom = catalog.rooms.map((r) => getFullyBookedForRoom(r.id, r.quantity || 1, liveBookedRanges));
    const everywhere = [...perRoom[0]].filter((d) => perRoom.every((s) => s.has(d)));
    return new Set([...blocked, ...everywhere]);
  }, [scopedRoom, catalog.blockedDates, catalog.rooms, liveBookedRanges]);

  const isComplete = nights >= 1;
  // Derived, not stored: the warning disappears the moment the range becomes valid.
  const showWarning = warned && !isComplete;
  const awaiting: "in" | "out" | null = !dateRange?.from ? "in" : !isComplete ? "out" : null;

  // Only while the check-out is still missing does an unavailable night become
  // tappable — and only as the check-out of THIS stay.
  const pendingCheckIn = dateRange?.from && !isComplete ? dateRange.from : null;
  const isDayDisabled = useMemo(
    () => makeStayDisabledMatcher(unavailableNights, pendingCheckIn),
    [unavailableNights, pendingCheckIn],
  );

  const handleSelect = (range: DateRange | undefined, triggerDate: Date) => {
    const blocker =
      range?.from && range?.to ? firstUnavailableNight(unavailableNights, range.from, range.to) : null;
    if (blocker) {
      // The tapped day sits beyond a night nobody can sleep in. Rather than
      // ignoring the tap — which would strand the guest, since react-day-picker
      // turns a tap on any earlier day into a range ENDING on the pending
      // check-in — restart the stay on the day they just tapped, and say why.
      setCrossedNight(blocker);
      setDates({ from: triggerDate, to: undefined });
      return;
    }
    setCrossedNight(null);
    setDates(range);
  };

  const handleDone = () => {
    if (!isComplete) {
      setWarned(true);
      return;
    }
    onOpenChange(false);
    onDone?.();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setWarned(false);
      setCrossedNight(null);
    }
    onOpenChange(next);
  };

  // Thai puts the day before the month ("29 ก.ค."), English the other way round.
  const alertDatePattern = locale === "th" ? "d MMM" : "MMM d";

  const cell = (active: boolean) =>
    `flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
      active ? "border-brand bg-brand/5" : "border-earth-200 bg-white"
    }`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid-cols-1 p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>{t("selectDates")}</DialogTitle>
        </DialogHeader>

        {/* Which half is still missing — visible before the guest can get it wrong. */}
        <div className="flex gap-2">
          <div className={cell(awaiting === "in")}>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-earth-400">
              {t("checkInLabel")}
            </span>
            <span className={`block text-sm ${dateRange?.from ? "font-semibold text-earth-900" : "text-earth-400"}`}>
              {dateRange?.from ? fmtDate(dateRange.from, "MMM d, yyyy", locale) : t("addDate")}
            </span>
          </div>
          <div className={cell(awaiting === "out")}>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-earth-400">
              {t("checkOutLabel")}
            </span>
            <span className={`block text-sm ${isComplete ? "font-semibold text-earth-900" : "text-earth-400"}`}>
              {isComplete && dateRange?.to ? fmtDate(dateRange.to, "MMM d, yyyy", locale) : t("addDate")}
            </span>
          </div>
        </div>

        <div className="py-1">
          <Calendar
            key={dateRange?.from?.toISOString() || "no-date"}
            mode="range"
            selected={dateRange}
            onSelect={handleSelect}
            locale={locale === "th" ? thLocale : undefined}
            captionLayout="dropdown"
            defaultMonth={dateRange?.from || startOfToday()}
            startMonth={startOfToday()}
            endMonth={addMonths(startOfToday(), 12)}
            formatters={locale === "th" ? {
              formatMonthDropdown: (date) => date.toLocaleDateString("th-TH", { month: "long" }),
              formatYearDropdown: (date) => String(date.getFullYear() + 543),
            } : undefined}
            disabled={[{ before: startOfToday() }, isDayDisabled]}
            numberOfMonths={1}
            className="w-full"
          />
        </div>

        {crossedNight ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-bold text-amber-900">{t("crossBookedTitle")}</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {/* Scoped, "every house is taken" would be a lie — the blocking
                    night is only taken in THIS house. */}
                {t(scopedRoom ? "crossBookedDescRoom" : "crossBookedDesc", {
                  date: fmtDate(parseISO(crossedNight), alertDatePattern, locale),
                  newDate: dateRange?.from ? fmtDate(dateRange.from, alertDatePattern, locale) : "",
                })}
              </p>
            </div>
          </div>
        ) : isComplete ? (
          <p className="text-center text-xs text-earth-500">
            {nights} {nights > 1 ? tc("nights") : tc("night")}
          </p>
        ) : showWarning ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-bold text-amber-900">{t("incompleteDatesTitle")}</p>
              <p className="mt-0.5 text-xs text-amber-800">{t("incompleteDatesDesc")}</p>
            </div>
          </div>
        ) : null}

        <Button className="w-full rounded-full bg-brand px-6 py-3.5 h-auto text-sm font-bold uppercase tracking-widest text-white hover:bg-brand-hover" onClick={handleDone}>
          {tc("done")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
