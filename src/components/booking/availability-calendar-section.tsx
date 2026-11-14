"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { format, startOfToday, addDays, addMonths } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { type DateRange, type DayButton, type Modifiers } from "react-day-picker";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Users } from "lucide-react";
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
import { BookingCalendarPanel } from "@/components/booking/booking-calendar-dialog";
import { RoomRateTable } from "@/components/booking/room-rate-table";
import { BOOKED_DAY, CalendarLegend, LEGEND_SWATCH } from "@/components/booking/calendar-legend";
import { RoomConfigDialog } from "@/components/booking/room-config-dialog";
import { useBookingCart, type CartLine } from "@/components/booking/booking-cart-context";
import {
  buildAvailabilityLookup,
  type DayAvailability,
  type RoomDayStatus,
} from "@/lib/booking-dates";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { fmtDate } from "@/lib/format-date";
import { useSwipe } from "@/hooks/use-swipe";
import { DemandEvent } from "@/lib/demand-events";
import { trackDemandOnce } from "@/lib/demand-track";
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
  available: "bg-white text-ink-2 hover:bg-mist",
  partial: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  full: `${BOOKED_DAY} hover:bg-red-200`,
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
          // 40px, or a seventh of the grid's width (100vw minus the section's
          // 2×1rem, the card's 2×0.75rem and 2px border, the calendar's own
          // 2×1rem) below ~370px, where seven 40px days overflow.
          "relative flex size-[min(2.5rem,calc((100vw_-_5.5rem_-_2px)/7))] items-center justify-center rounded-full text-sm font-medium select-none transition-colors md:size-14 md:text-base",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2",
          isPast && "cursor-not-allowed text-line-strong",
          status && `cursor-pointer ${STATUS_CLASS[status]}`,
          modifiers.outside && status && "opacity-55",
          // Today is marked by its number alone — bold and brand-green. twMerge
          // drops the status text colour so the green wins on any background.
          modifiers.today && "font-bold text-pine",
          className,
        )}
      >
        {children}
      </button>
    );
  };
}

const PILL_BASE =
  "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset";

function RoomStatusPill({ row }: { row: RoomDayStatus }) {
  const t = useTranslations("availability");

  let cls: string;
  let label: string;
  if (row.blocked) {
    cls = "bg-mist-2 text-ink-3 ring-line";
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
      className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-mist-2"
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

/** Header of a dialog view the guest stepped into from the day's house list. */
function BackHeader({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  const tc = useTranslations("common");
  return (
    // text-left overrides DialogHeader's mobile centering: with a back arrow
    // pinned left, a centered line under a left-aligned title reads crooked.
    <DialogHeader className="pr-10 text-left">
      {/* gap-2.5 leaves the focus ring (2px + 2px offset) clear of the title. */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={tc("back")}
          className="-ml-2 shrink-0 rounded-full p-2 text-ink-3 transition-colors hover:bg-mist-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <DialogTitle className="min-w-0 truncate">{title}</DialogTitle>
      </div>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
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

  const specialPrices = useMemo(
    () => catalog.specialPrices.filter((s) => s.room_id === room.id),
    [room.id, catalog.specialPrices],
  );

  const night = useMemo(
    () =>
      calculateTotalPrice({
        basePricePerNight: room.price_per_night,
        checkIn: date,
        checkOut: addDays(date, 1),
        seasons,
        specialPrices,
      }).breakdown[0],
    [room.price_per_night, date, seasons, specialPrices],
  );

  return (
    <>
      <BackHeader
        title={room.name}
        description={fmtDate(date, "EEEE d MMMM yyyy", locale)}
        onBack={onBack}
      />

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
          <span className="text-2xl font-bold text-ink">
            ฿{(night?.price ?? room.price_per_night).toLocaleString()}
          </span>
          <span className="text-xs text-ink-3">{tc("perNight")}</span>
          {night?.seasonName && (
            <span className="ml-1 truncate rounded-full bg-pine/10 px-2 py-0.5 text-xs font-semibold text-pine">
              {night.seasonName}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist-2 px-2.5 py-1 text-ink-2">
            <Users className="h-3.5 w-3.5" />
            {ta("upToGuests", { count: room.max_guests })}
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {tr("available", { count: freeCount })}
          </span>
        </div>

        {/* The headline above prices only the tapped night; this is what the
            house costs the rest of the year, same table as the house card. */}
        <RoomRateTable room={room} seasonalPrices={seasons} specialPrices={specialPrices} />

        {room.description && (
          <HTMLContent content={room.description} className="text-sm leading-relaxed text-ink-2" />
        )}

        <Button
          className="w-full rounded-full bg-pine px-6 py-3.5 h-auto text-sm font-bold text-white hover:bg-pine-hover focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
          onClick={onBook}
        >
          {t("bookThisHouse")}
        </Button>
      </div>
    </>
  );
}

export function AvailabilityCalendarSection({ homestayId }: { homestayId: string }) {
  const { catalog, liveBookedRanges, dateRange, setDates, lines, isRoomAvailableForRange, remainingForRoom } = useBookingCart();
  // The guest's dates from before "จองบ้านพักนี้" seeded a new check-in; Back or
  // closing without Done puts them back instead of leaving half a range.
  const datesBeforePick = useRef<DateRange | undefined>(undefined);
  const t = useTranslations("availability");
  const tr = useTranslations("rooms");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `open` is tracked apart from `selectedDate` so the modal keeps its contents
  // while it animates closed (clearing the date would flash an empty dialog).
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // Which house the modal is showing in detail; null = the day's house list.
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null);
  // The house the modal is picking a check-out for; it outranks the other two
  // views. Held apart from `detailRoomId`, which says where Back returns to.
  const [pickRoomId, setPickRoomId] = useState<string | null>(null);
  // The house config dialog (guests, add-ons) the picker hands over to.
  const [config, setConfig] = useState<{ room: Room; editingLine?: CartLine } | null>(null);

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
    // A new date always opens on the house list.
    setDetailRoomId(null);
    setPickRoomId(null);
    setOpen(true);
  };

  // Booking from here starts the normal flow: the tapped date becomes the
  // check-in (overriding any range already picked — it is the guest's most
  // recent, most explicit choice — until they leave without Done, see
  // cancelPick) and the shared picker, shown in this same
  // dialog, asks for the check-out. The picker is scoped to this house: the
  // guest chose it before their dates, so a range it cannot serve must not be
  // offered.
  const handleBook = (roomId: string) => {
    if (!selectedDate) return;
    datesBeforePick.current = dateRange;
    setDates({ from: selectedDate, to: undefined });
    setPickRoomId(roomId);
  };

  // Leaving the picker without Done (Back, the close button, Esc, the overlay).
  const cancelPick = () => {
    setDates(datesBeforePick.current);
    setPickRoomId(null);
  };

  // Done closes the dialog itself (setOpen), so only a dismissal lands here.
  const handleOpenChange = (next: boolean) => {
    if (!next && pickRoomId) cancelPick();
    setOpen(next);
  };

  const scrollToRooms = () => {
    setTimeout(
      () => document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      150,
    );
  };

  // The guest already chose the house, so a confirmed range goes straight to
  // that house's config dialog instead of back to the house list. Same checks
  // as the house card's button (rooms-section `handleAddToCart`).
  const handlePickerDone = () => {
    setOpen(false);
    const room = activeRooms.find((r) => r.id === pickRoomId);
    const line = room ? lines.find((l) => l.roomId === room.id) : undefined;
    if (room && isRoomAvailableForRange(room) && remainingForRoom(room) > 0) {
      setTimeout(() => setConfig({ room }), 150);
    } else if (room && line) {
      setTimeout(() => setConfig({ room, editingLine: line }), 150);
    } else {
      if (room) toast.error(tr("roomUnavailableToast"));
      scrollToRooms();
    }
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
  const pickRoom = pickRoomId ? activeRooms.find((r) => r.id === pickRoomId) : undefined;

  // Fires calendar_view once the guest actually scrolls the availability
  // calendar into view. Disconnects on the first hit; trackDemandOnce guards
  // against a second observer from a re-mount.
  const sectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        trackDemandOnce(`calendar_view:${homestayId}`, {
          homestayId,
          eventType: DemandEvent.CALENDAR_VIEW,
          locale,
        });
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [homestayId, locale]);

  if (activeRooms.length === 0) return null;

  return (
    <section ref={sectionRef} className="py-14 md:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="overflow-hidden pt-4 -mt-4">
          <motion.h2
            initial={{ y: "100%" }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
            className="text-2xl md:text-3xl font-serif leading-tight text-ink tracking-tight"
          >
            {t("title")}
          </motion.h2>
        </div>
        <p className="mt-2 text-sm text-ink-3">{t("subtitle")}</p>

        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-6">
          {mounted ? (
            <Calendar
              showOutsideDays
              locale={locale === "th" ? thLocale : undefined}
              captionLayout="dropdown"
              classNames={{
                weekday:
                  "flex-1 text-[0.7rem] md:text-sm font-semibold text-ink-3 text-center py-2 md:py-3 select-none",
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
            <div className="h-[22rem] animate-pulse rounded-xl bg-mist md:h-[26rem]" />
          )}

          <CalendarLegend
            className="mt-3 border-t border-line px-2 pt-3"
            items={[
              { swatch: LEGEND_SWATCH.free, label: t("legendAvailable") },
              { swatch: LEGEND_SWATCH.partial, label: t("legendPartial") },
              { swatch: LEGEND_SWATCH.full, label: t("legendFull") },
            ]}
          />
        </div>
      </div>

      {/* One dialog, three views: the day's house list, one house in detail,
          or the check-out picker for one house. Swapping the body in place
          keeps a single overlay + focus trap, which the rest of the page also
          prefers over stacked modal layers. */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            "max-h-[85vh] overflow-y-auto",
            // The picker's 44px days need the narrower phone padding to fit 7 across.
            pickRoom ? "grid-cols-1 p-4 sm:max-w-md sm:p-6" : showDetail ? "sm:max-w-lg" : "sm:max-w-md",
          )}
        >
          {pickRoom ? (
            <>
              <BackHeader
                title={tb("selectDates")}
                description={pickRoom.name}
                onBack={cancelPick}
              />
              {/* Seeded with the tapped date as check-in and scoped to the
                  house, so its booked nights can't be selected. */}
              <BookingCalendarPanel roomId={pickRoom.id} onDone={handlePickerDone} />
            </>
          ) : showDetail ? (
            <RoomDayDetail
              room={detailRoom}
              date={selectedDate}
              freeCount={detailRow.free}
              onBack={() => setDetailRoomId(null)}
              onBook={() => handleBook(detailRoom.id)}
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
                    className="rounded-xl border border-line bg-mist/40 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                        {roomNameById.get(row.roomId)}
                      </span>
                      <RoomStatusPill row={row} />
                    </div>
                    {/* Only houses with a unit left that night can be opened or
                        booked — a booked or closed one has nothing to book. */}
                    {!row.blocked && row.free > 0 && (
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailRoomId(row.roomId)}
                          className="-ml-1 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-1 text-xs text-ink-2 underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                        >
                          {t("viewDetails")}
                        </button>
                        {/* Secondary, like the house card's "วันว่าง & ราคา": one
                            filled button per row read as a wall of CTAs. */}
                        <button
                          type="button"
                          className="flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-white px-5 text-sm font-medium text-ink transition-colors hover:bg-mist outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                          onClick={() => handleBook(row.roomId)}
                        >
                          {t("bookThisHouse")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>

      <RoomConfigDialog
        key={config?.editingLine?.lineId ?? config?.room.id ?? "none"}
        room={config?.room ?? null}
        editingLine={config?.editingLine ?? null}
        open={!!config}
        onClose={() => setConfig(null)}
      />
    </section>
  );
}
