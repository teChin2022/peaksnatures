"use client";

import * as React from "react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { format, startOfToday, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { type DayButton, type Modifiers } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import {
  buildAvailabilityLookup,
  type DayAvailability,
  type RoomDayStatus,
} from "@/lib/booking-dates";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/**
 * Availability overview shown just above the gallery ("บรรยากาศ"). Colors every
 * date across ALL rooms: green = free, amber = some rooms left, red = fully
 * booked/blocked. Tapping (mobile) or clicking (desktop) a date opens a modal
 * listing which rooms are booked and which are free that day.
 *
 * Reads the same live availability as the rest of the booking flow (via the cart
 * context), so it stays in sync after the client-side refresh.
 *
 * Rendered client-only (useSyncExternalStore gate) because the colored/disabled
 * days depend on "today", which can differ between a UTC server and a Thai
 * visitor near midnight — gating avoids a hydration mismatch.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

const STATUS_CLASS: Record<DayAvailability, string> = {
  available: "bg-white text-earth-700 hover:bg-earth-50",
  partial: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  full: "bg-red-100 text-red-600 line-through decoration-red-400/60 hover:bg-red-200",
};

function makeAvailabilityDay(
  getStatus: (key: string) => DayAvailability,
  statusLabel: (status: DayAvailability) => string,
) {
  return function AvailabilityDay({
    day,
    modifiers,
    className,
    children,
    ...props
  }: React.ComponentProps<typeof DayButton>) {
    // Only past days are inactive. Adjacent-month ("outside") days are still
    // colored and clickable, just de-emphasized so the current month stands out.
    const isPast = modifiers.disabled;
    const status = isPast ? null : getStatus(format(day.date, "yyyy-MM-dd"));

    return (
      <button
        {...props}
        type="button"
        aria-label={
          status
            ? `${format(day.date, "d MMM yyyy")} — ${statusLabel(status)}`
            : undefined
        }
        className={cn(
          "relative flex size-10 items-center justify-center rounded-full text-sm font-medium select-none transition-colors md:size-14 md:text-base",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          isPast && "cursor-not-allowed text-earth-300",
          status && `cursor-pointer ${STATUS_CLASS[status]}`,
          modifiers.outside && status && "opacity-55",
          modifiers.today && "font-bold outline outline-2 outline-offset-1 outline-brand",
          className,
        )}
      >
        {children}
      </button>
    );
  };
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3.5 rounded-full ring-1 ring-inset", swatch)} />
      {label}
    </span>
  );
}

const PILL_BASE =
  "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset";

function RoomStatusPill({ row }: { row: RoomDayStatus }) {
  const t = useTranslations("availability");

  let cls: string;
  let label: string;
  if (row.blocked) {
    cls = "bg-earth-100 text-earth-500 ring-earth-200";
    label = t("roomClosed");
  } else if (row.free === 0) {
    cls = "bg-red-50 text-red-600 ring-red-200";
    label = t("roomBooked");
  } else if (row.booked === 0) {
    cls = "bg-emerald-50 text-emerald-700 ring-emerald-200";
    label = row.total > 1 ? t("roomFreeCount", { count: row.free }) : t("roomAvailable");
  } else {
    cls = "bg-amber-50 text-amber-800 ring-amber-200";
    label = t("roomLeftCount", { count: row.free });
  }

  return <span className={cn(PILL_BASE, cls)}>{label}</span>;
}

export function AvailabilityCalendarSection() {
  const { catalog, liveBookedRanges } = useBookingCart();
  const t = useTranslations("availability");
  const locale = useLocale();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `open` is tracked apart from `selectedDate` so the modal keeps its contents
  // while it animates closed (clearing the date would flash an empty dialog).
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const activeRooms = useMemo(
    () => catalog.rooms.filter((r) => r.is_active),
    [catalog.rooms],
  );

  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of activeRooms) map.set(r.id, r.name);
    return map;
  }, [activeRooms]);

  const lookup = useMemo(
    () => buildAvailabilityLookup(activeRooms, liveBookedRanges, catalog.blockedDates),
    [activeRooms, liveBookedRanges, catalog.blockedDates],
  );

  const statusLabel = useMemo(() => {
    const labels: Record<DayAvailability, string> = {
      available: t("legendAvailable"),
      partial: t("legendPartial"),
      full: t("legendFull"),
    };
    return (status: DayAvailability) => labels[status];
  }, [t]);

  const DayComponent = useMemo(
    () => makeAvailabilityDay(lookup.getStatus, statusLabel),
    [lookup, statusLabel],
  );

  const handleDayClick = (date: Date, modifiers: Modifiers) => {
    if (modifiers.disabled) return;
    setSelectedDate(date);
    setOpen(true);
  };

  const breakdown = useMemo(
    () => (selectedDate ? lookup.getBreakdown(format(selectedDate, "yyyy-MM-dd")) : []),
    [selectedDate, lookup],
  );
  const totalUnits = breakdown.reduce((s, r) => s + r.total, 0);
  const freeUnits = breakdown.reduce((s, r) => s + r.free, 0);

  if (activeRooms.length === 0) return null;

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="overflow-hidden pt-4 -mt-4">
          <motion.h2
            initial={{ y: "100%" }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
            className="text-2xl md:text-3xl font-serif leading-tight text-earth-900 tracking-tight"
          >
            {t("title")}
          </motion.h2>
        </div>
        <p className="mt-2 text-sm text-earth-500">{t("subtitle")}</p>

        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-earth-200 bg-white p-3 shadow-sm sm:p-6">
          {mounted ? (
            <Calendar
              showOutsideDays
              locale={locale === "th" ? thLocale : undefined}
              captionLayout="dropdown"
              classNames={{
                weekday:
                  "flex-1 text-[0.7rem] md:text-sm font-semibold uppercase tracking-widest text-earth-400 text-center py-2 md:py-3 select-none",
              }}
              defaultMonth={startOfToday()}
              startMonth={startOfToday()}
              endMonth={addMonths(startOfToday(), 12)}
              formatters={
                locale === "th"
                  ? {
                      formatMonthDropdown: (date) =>
                        date.toLocaleDateString("th-TH", { month: "long" }),
                      formatYearDropdown: (date) => String(date.getFullYear() + 543),
                    }
                  : undefined
              }
              disabled={{ before: startOfToday() }}
              onDayClick={handleDayClick}
              numberOfMonths={1}
              components={{ DayButton: DayComponent }}
              className="w-full"
            />
          ) : (
            <div className="h-[22rem] animate-pulse rounded-xl bg-earth-50 md:h-[26rem]" />
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-earth-100 px-2 pt-3 text-xs text-earth-600">
            <LegendItem swatch="bg-white ring-earth-300" label={t("legendAvailable")} />
            <LegendItem swatch="bg-amber-100 ring-amber-300" label={t("legendPartial")} />
            <LegendItem swatch="bg-red-100 ring-red-300" label={t("legendFull")} />
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDate ? fmtDate(selectedDate, "EEEE d MMMM yyyy", locale) : ""}
            </DialogTitle>
            <DialogDescription>
              {t("summary", { free: freeUnits, total: totalUnits })}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {breakdown.map((row) => (
              <li
                key={row.roomId}
                className="flex items-center justify-between gap-3 rounded-xl border border-earth-100 bg-earth-50/40 px-3 py-2.5"
              >
                <span className="min-w-0 truncate text-sm font-medium text-earth-800">
                  {roomNameById.get(row.roomId)}
                </span>
                <RoomStatusPill row={row} />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  );
}
