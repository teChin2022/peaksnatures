"use client";

import { useMemo } from "react";
import { format, startOfToday, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullyBookedForRoom } from "@/lib/booking-dates";
import { useBookingCart } from "@/components/booking/booking-cart-context";

/**
 * Shared date-range picker dialog for the homestay page. Reads/writes the one
 * shared cart date range and disables past dates, homestay-wide blocked dates,
 * and dates fully booked across EVERY room. Used by both the desktop date bar
 * and the mobile booking bar. `onDone` fires when the guest confirms a valid
 * range (e.g. to nudge them toward the rooms).
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
  const { dateRange, setDates, catalog, liveBookedRanges } = useBookingCart();
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();

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

  const handleSelect = (range: DateRange | undefined) => {
    setDates(range);
  };

  const handleDone = () => {
    onOpenChange(false);
    if (dateRange?.from && dateRange?.to && dateRange.to.getTime() !== dateRange.from.getTime()) {
      onDone?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("selectDates")}</DialogTitle>
        </DialogHeader>
        <div className="p-2">
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
        <Button className="w-full bg-brand text-white hover:bg-brand-hover rounded-full" onClick={handleDone}>
          {tc("done")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
