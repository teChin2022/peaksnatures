"use client";

import { useMemo, useState } from "react";
import { format, startOfToday, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format-date";
import { getFullyBookedForRoom } from "@/lib/booking-dates";
import { useBookingCart } from "@/components/booking/booking-cart-context";

/**
 * Shared date-range picker dialog for the homestay page. Reads/writes the one
 * shared cart date range and disables past dates, homestay-wide blocked dates,
 * and dates fully booked across EVERY room. Used by both the desktop date bar
 * and the mobile booking bar. `onDone` fires when the guest confirms a valid
 * range (e.g. to nudge them toward the rooms).
 *
 * A range is only usable at `nights >= 1`. react-day-picker sets from===to on the
 * first tap, so a half-picked range looks "set" but prices nothing — the header
 * below shows which half is still missing, and Done refuses to close until both
 * are picked.
 */
export function BookingCalendarDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const { dateRange, setDates, nights, catalog, liveBookedRanges } = useBookingCart();
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [warned, setWarned] = useState(false);

  // Homestay-wide blocked dates + dates fully booked across EVERY room (a date
  // stays selectable as long as at least one room is free).
  const { blockedHomestay, fullyEverywhere } = useMemo(() => {
    const blocked = new Set(catalog.blockedDates.filter((d) => d.room_id === null).map((d) => d.date));
    if (catalog.rooms.length === 0) return { blockedHomestay: blocked, fullyEverywhere: new Set<string>() };
    const perRoom = catalog.rooms.map((r) => getFullyBookedForRoom(r.id, r.quantity || 1, liveBookedRanges));
    const all = new Set<string>();
    perRoom.forEach((s) => s.forEach((d) => all.add(d)));
    const everywhere = new Set<string>();
    all.forEach((d) => {
      if (perRoom.every((s) => s.has(d))) everywhere.add(d);
    });
    return { blockedHomestay: blocked, fullyEverywhere: everywhere };
  }, [catalog.blockedDates, catalog.rooms, liveBookedRanges]);

  const isComplete = nights >= 1;
  // Derived, not stored: the warning disappears the moment the range becomes valid.
  const showWarning = warned && !isComplete;
  const awaiting: "in" | "out" | null = !dateRange?.from ? "in" : !isComplete ? "out" : null;

  const handleSelect = (range: DateRange | undefined) => {
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
    if (!next) setWarned(false);
    onOpenChange(next);
  };

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
            disabled={[
              { before: startOfToday() },
              (date: Date) => {
                const key = format(date, "yyyy-MM-dd");
                return blockedHomestay.has(key) || fullyEverywhere.has(key);
              },
            ]}
            numberOfMonths={1}
            className="w-full"
          />
        </div>

        {isComplete ? (
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
