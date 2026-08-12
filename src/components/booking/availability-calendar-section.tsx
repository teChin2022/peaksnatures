"use client";

import * as React from "react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { format, startOfToday, addDays, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { type DayButton, type Modifiers } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HTMLContent } from "@/components/ui/html-content";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { useBookingCart } from "@/components/booking/booking-cart-context";
import {
  buildAvailabilityLookup,
  type DayAvailability,
  type RoomDayStatus,
} from "@/lib/booking-dates";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { useSwipe } from "@/hooks/use-swipe";
import { cn } from "@/lib/utils";
import type { Room } from "@/types/database";

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
          // Today is marked by its number alone — bold and brand-green. twMerge
          // drops the status text colour so the green wins on any background.
          modifiers.today && "font-bold text-brand",
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

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2UyZThmMCIvPjwvc3ZnPg==";

/** Swipeable photo strip — the room-card carousel trimmed to fit a dialog (no arrows, no lightbox). */
function RoomPhotos({ images, name }: { images: string[]; name: string }) {
  const t = useTranslations("rooms");
  const [index, setIndex] = useState(0);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const multi = images.length > 1;

  const prev = useCallback(
    () => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)),
    [images.length],
  );
  const next = useCallback(
    () => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)),
    [images.length],
  );

  useSwipe(containerEl, { onSwipeLeft: next, onSwipeRight: prev });

  // Mount the current image and BOTH its neighbours, wrapping — the arrows and
  // swipe wrap too, so stepping off either end would otherwise land on an
  // unmounted image and flash empty. Keeping the neighbours loaded means you can
  // never arrive at one that isn't there, so nothing needs remembering.
  const isNear = (i: number) =>
    i === index ||
    i === (index + 1) % images.length ||
    i === (index - 1 + images.length) % images.length;

  if (images.length === 0) return null;

  return (
    <div
      ref={setContainerEl}
      className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-earth-100"
      style={{ touchAction: "pan-y" }}
    >
      <div
        className="absolute inset-0 flex transition-transform duration-500 ease-out will-change-transform"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((src, i) => (
          <div key={src} className="relative h-full w-full shrink-0">
            {isNear(i) && (
              <Image
                src={src}
                alt={`${name} photo ${i + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, 512px"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>

      {/* Arrows — desktop only, fading in on hover, same as the room cards */}
      {multi && (
        <>
          <button
            type="button"
            aria-label={t("prevPhoto")}
            onClick={prev}
            className="absolute left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-black/50 focus-visible:opacity-100 group-hover:opacity-100 md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={t("nextPhoto")}
            onClick={next}
            className="absolute right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-black/50 focus-visible:opacity-100 group-hover:opacity-100 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dots sit at the TOP of the image, as on the room cards — identical on mobile
          and desktop. The button's padding grows the tap target; the matching negative
          margins cancel it out of layout, so the dots keep the tight gap-1.5 pitch. */}
      {multi && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-1.5 bg-gradient-to-b from-black/20 to-transparent pt-3 pb-6">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={t("goToPhoto", { number: i + 1 })}
              onClick={() => setIndex(i)}
              className="px-1 -mx-1 py-2 -my-2"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all",
                  i === index ? "w-3 bg-white" : "w-1.5 bg-white/50 pointer-fine:hover:bg-white/80",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Detail view for one house on one night, shown in place of the day list (the
 * same dialog swaps its body — see the section below). Quotes the rate for THAT
 * night rather than the card list's "from" range, since the date is known here.
 */
function RoomDayDetail({
  room,
  date,
  freeCount,
  onBack,
  onBook,
}: {
  room: Room;
  date: Date;
  freeCount: number;
  onBack: () => void;
  onBook: () => void;
}) {
  const t = useTranslations("availability");
  const tr = useTranslations("rooms");
  const ta = useTranslations("about");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { catalog } = useBookingCart();

  const seasons = useMemo(
    () =>
      catalog.seasonalPrices
        .filter((s) => s.room_id === room.id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [room.id, catalog.seasonalPrices],
  );

  const night = useMemo(
    () => calculateTotalPrice(room.price_per_night, date, addDays(date, 1), seasons).breakdown[0],
    [room.price_per_night, date, seasons],
  );

  return (
    <>
      {/* text-left overrides DialogHeader's mobile centering: with a back arrow
          pinned left, a centered date under a left-aligned title reads crooked. */}
      <DialogHeader className="pr-10 text-left">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            aria-label={tc("back")}
            className="-ml-2 shrink-0 rounded-full p-2 text-earth-500 transition-colors hover:bg-earth-100 hover:text-earth-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle className="min-w-0 truncate">{room.name}</DialogTitle>
        </div>
        <DialogDescription>{fmtDate(date, "EEEE d MMMM yyyy", locale)}</DialogDescription>
      </DialogHeader>

      {/* One block wrapper, NOT more grid items. DialogContent is a grid, and an
          aspect-ratio box whose children are all absolute has no in-flow content
          height — as a direct grid item its row collapses (~8px), the box then
          renders at its ratio height, overflows the row, and (being positioned)
          paints over the static siblings below it. Normal block flow resolves
          the width first, so the ratio sizes correctly — which also lets the
          dialog's max-h/overflow-y actually scroll. */}
      <div className="space-y-4">
        <RoomPhotos images={room.images} name={room.name} />

        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-earth-900">
            ฿{(night?.price ?? room.price_per_night).toLocaleString()}
          </span>
          <span className="text-xs text-earth-400">{tc("perNight")}</span>
          {night?.seasonName && (
            <span className="ml-1 truncate rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
              {night.seasonName}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-earth-100 px-2.5 py-1 text-earth-700">
            <Users className="h-3.5 w-3.5" />
            {ta("upToGuests", { count: room.max_guests })}
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {tr("available", { count: freeCount })}
          </span>
        </div>

        {/* Base + seasonal rates, same block as the room card's "วันว่าง & ราคา"
            dialog — the headline above prices only the tapped night, so this is
            where a guest sees what the house costs the rest of the year. */}
        <div className="rounded-2xl bg-earth-50 px-5 py-5">
          <div className="mb-4 flex items-center gap-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-earth-500">
              {tr("priceDetailsTitle")}
            </h4>
            <div className="h-px flex-1 bg-earth-200" />
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium text-earth-800">{tr("basePrice")}</span>
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-2xl font-bold text-earth-900">
                ฿{room.price_per_night.toLocaleString()}
              </span>
              <span className="text-xs text-earth-500">{tc("perNight")}</span>
            </div>
          </div>

          {seasons.length > 0 && (
            <div className="mt-5 border-t border-dashed border-earth-300 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-brand" strokeWidth={2.5} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-earth-500">
                  {tr("seasonalRates")}
                </span>
              </div>
              <ul className="space-y-3">
                {seasons.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-sm font-medium text-earth-900">{s.name}</div>
                      <div className="mt-0.5 text-[11px] text-earth-500 tabular-nums">
                        {fmtDateStr(s.start_date, "d MMM", locale)} – {fmtDateStr(s.end_date, "d MMM yyyy", locale)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
                      <span className="text-lg font-bold text-brand">
                        ฿{s.price_per_night.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-earth-500">{tc("perNight")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {room.description && (
          <HTMLContent content={room.description} className="text-sm leading-relaxed text-earth-600" />
        )}

        <Button
          className="w-full rounded-full bg-brand px-6 py-3.5 h-auto text-sm font-bold uppercase tracking-widest text-white hover:bg-brand-hover"
          onClick={onBook}
        >
          {t("bookThisHouse")}
        </Button>
      </div>
    </>
  );
}

export function AvailabilityCalendarSection() {
  const { catalog, liveBookedRanges, setDates } = useBookingCart();
  const t = useTranslations("availability");
  const locale = useLocale();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `open` is tracked apart from `selectedDate` so the modal keeps its contents
  // while it animates closed (clearing the date would flash an empty dialog).
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // Which house the modal is showing in detail; null = the day's house list.
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // The house the open date picker is for. Held apart from `detailRoomId` so
  // the picker's scope survives the modal's view state being reset.
  const [bookingRoomId, setBookingRoomId] = useState<string | null>(null);

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
    setDetailRoomId(null); // a new date always opens on the house list
    setOpen(true);
  };

  // Booking from here starts the normal flow: the tapped date becomes the
  // check-in (overriding any range already picked — it is the guest's most
  // recent, most explicit choice) and the shared picker asks for the check-out.
  // The picker is scoped to this house: the guest chose it before their dates,
  // so a range it cannot serve must not be offered.
  const handleBook = () => {
    if (!selectedDate || !detailRoomId) return;
    setBookingRoomId(detailRoomId);
    setDates({ from: selectedDate, to: undefined });
    setOpen(false);
    // Let the day modal's overlay unmount before the picker's mounts.
    setTimeout(() => setCalendarOpen(true), 150);
  };

  const scrollToRooms = () => {
    setTimeout(
      () => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150,
    );
  };

  const breakdown = useMemo(
    () => (selectedDate ? lookup.getBreakdown(format(selectedDate, "yyyy-MM-dd")) : []),
    [selectedDate, lookup],
  );
  const totalUnits = breakdown.reduce((s, r) => s + r.total, 0);
  const freeUnits = breakdown.reduce((s, r) => s + r.free, 0);

  const detailRow = detailRoomId ? breakdown.find((r) => r.roomId === detailRoomId) : undefined;
  const detailRoom = detailRoomId ? activeRooms.find((r) => r.id === detailRoomId) : undefined;
  const showDetail = !!detailRoom && !!detailRow && !!selectedDate;

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

      {/* One dialog, two views: the day's house list, or one house in detail.
          Swapping the body in place keeps a single overlay + focus trap, which
          the rest of the page also prefers over stacked modal layers. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn("max-h-[85vh] overflow-y-auto", showDetail ? "sm:max-w-lg" : "sm:max-w-md")}
        >
          {showDetail ? (
            <RoomDayDetail
              room={detailRoom}
              date={selectedDate}
              freeCount={detailRow.free}
              onBack={() => setDetailRoomId(null)}
              onBook={handleBook}
            />
          ) : (
            <>
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
                    className="flex items-center gap-2 rounded-xl border border-earth-100 bg-earth-50/40 px-3 py-2.5"
                  >
                    {/* flex-1 on the name (not justify-between) keeps the link
                        and the pill together as one group on the right. */}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-earth-800">
                      {roomNameById.get(row.roomId)}
                    </span>
                    {/* Only houses with a unit left that night are worth opening
                        — a booked or closed one has nothing to book. */}
                    {!row.blocked && row.free > 0 && (
                      <button
                        type="button"
                        onClick={() => setDetailRoomId(row.roomId)}
                        className="-my-1 shrink-0 whitespace-nowrap px-1 py-2 text-xs text-earth-600 underline underline-offset-2 transition-colors hover:text-earth-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        {t("viewDetails")}
                      </button>
                    )}
                    <RoomStatusPill row={row} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Shared date picker, seeded with the tapped date as check-in and scoped
          to the chosen house so its booked nights can't be selected */}
      <BookingCalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        onDone={scrollToRooms}
        roomId={bookingRoomId}
      />
    </section>
  );
}
