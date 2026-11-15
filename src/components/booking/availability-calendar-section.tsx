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
import { thumbScroll } from "@/components/booking/gallery-section";
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
    // colored and clickable, just lighter in weight so the current month stands
    // out. Not faded: a faded day measured 2.5:1 while still tappable (B2).
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
          modifiers.outside && status && "font-normal",
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

/** Coloured text, not a pill: five pills in a list made the one booked house the loudest thing on screen. */
function RoomStatusText({ row }: { row: RoomDayStatus }) {
  const t = useTranslations("availability");

  let cls: string;
  let label: string;
  if (row.blocked) {
    cls = "text-ink-3";
    label = t("roomClosed");
  } else if (row.free === 0) {
    cls = "text-red-700";
    label = t("roomBooked");
  } else if (row.booked === 0) {
    cls = "text-emerald-700";
    label = row.total > 1 ? t("roomFreeCount", { count: row.free }) : t("roomAvailable");
  } else {
    cls = "text-amber-800";
    label = t("roomLeftCount", { count: row.free });
  }

  return <span className={cn("shrink-0 font-medium", cls)}>{label}</span>;
}

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2UyZThmMCIvPjwvc3ZnPg==";

/** Swipeable photos with a thumbnail row — the house card's carousel trimmed to fit a dialog (no lightbox). */
function RoomPhotos({ images, name }: { images: string[]; name: string }) {
  const t = useTranslations("rooms");
  const tg = useTranslations("gallery");
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
    <div>
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
                  alt={tg("photoAlt", { name, number: i + 1 })}
                  fill
                  sizes="(max-width: 640px) 100vw, 448px"
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          ))}
        </div>

        {/* Photo count, as on the house card (rooms-section). */}
        {multi && (
          <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 z-10 rounded-full bg-black/70 px-2.5 py-0.5 text-xs text-white tabular-nums">
            {index + 1} / {images.length}
          </span>
        )}

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
      </div>

      {/* Thumbnails under the photo, as on the house card's phone layout; the shown one keeps in view as the photo changes.
          -mx-1 px-1 pb-1: room for the ring and focus ring, which the scrolling row would otherwise clip. */}
      {multi && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pt-3 pb-1 [scrollbar-width:none]">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={t("goToPhoto", { number: i + 1 })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              ref={(el) => {
                if (i === index) el?.scrollIntoView?.({ inline: "nearest", block: "nearest", behavior: thumbScroll() });
              }}
              className={cn(
                // 44px tall: the minimum touch target.
                "relative h-11 w-16 shrink-0 overflow-hidden rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1",
                i === index ? "opacity-100 ring-2 ring-pine" : "opacity-60 hover:opacity-100",
              )}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Header of a dialog view the guest stepped into from the day's house list. */
function BackHeader({
  title,
  description,
  onBack,
  className,
}: {
  title: string;
  description: string;
  onBack: () => void;
  className?: string;
}) {
  const tc = useTranslations("common");
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Swapping views unmounts the button that held focus, which would drop it on
  // the dialog itself; the new view's title is where a screen reader should land.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    // text-left overrides DialogHeader's mobile centering: with a back arrow
    // pinned left, a centered line under a left-aligned title reads crooked.
    <DialogHeader className={cn("pr-10 text-left", className)}>
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
        <DialogTitle ref={titleRef} tabIndex={-1} className="min-w-0 truncate outline-none">
          {title}
        </DialogTitle>
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

  // The dialog is a flex column in this view (see the section below): the
  // header and the footer stay put while the body between them scrolls, so
  // Back, close and Book are always on screen.
  return (
    <>
      <BackHeader
        title={room.name}
        description={fmtDate(date, "EEEE d MMMM yyyy", locale)}
        onBack={onBack}
        className="px-6 pr-12 pt-6 pb-3"
      />

      {/* A block wrapper, so the photo's aspect-ratio box (all absolute
          children, no in-flow height) gets its width before its height. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
        <RoomPhotos images={room.images} name={room.name} />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist-2 px-2.5 py-1 text-ink-2">
            <Users className="h-3.5 w-3.5" />
            {ta("upToGuests", { count: room.max_guests })}
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {tr("available", { count: freeCount })}
          </span>
        </div>

        {/* What the house is, before what it costs across the year. */}
        {room.description && (
          <HTMLContent content={room.description} className="text-sm leading-relaxed text-ink-2" />
        )}

        {/* The footer prices only the tapped night; this is what the house
            costs the rest of the year, same table as the house card. */}
        <RoomRateTable room={room} seasonalPrices={seasons} specialPrices={specialPrices} />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1 tabular-nums">
            <span className="text-xl font-bold text-ink">
              ฿{(night?.price ?? room.price_per_night).toLocaleString()}
            </span>
            <span className="text-xs text-ink-3">{tc("perNight")}</span>
          </p>
          {night?.seasonName && (
            <p className="truncate text-xs font-semibold text-pine">{night.seasonName}</p>
          )}
        </div>
        <Button
          className="h-auto shrink-0 rounded-full bg-pine px-6 py-3.5 text-sm font-bold text-white hover:bg-pine-hover focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
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
  // The list button ("details:<id>" or "book:<id>") that Back returns focus to:
  // the view swap unmounted it, so focus would otherwise land on the dialog.
  const returnFocus = useRef<string | null>(null);
  const focusOnReturn = (key: string) => (el: HTMLButtonElement | null) => {
    if (el && returnFocus.current === key) {
      returnFocus.current = null;
      el.focus();
    }
  };

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
  // that house's config dialog, over the house list (which the picker's Done
  // narrowed to this house). Same checks as the house card's button
  // (rooms-section `handleAddToCart`).
  const handlePickerDone = () => {
    setOpen(false);
    scrollToRooms();
    const room = activeRooms.find((r) => r.id === pickRoomId);
    const line = room ? lines.find((l) => l.roomId === room.id) : undefined;
    if (room && isRoomAvailableForRange(room) && remainingForRoom(room) > 0) {
      setTimeout(() => setConfig({ room }), 150);
    } else if (room && line) {
      setTimeout(() => setConfig({ room, editingLine: line }), 150);
    } else if (room) {
      toast.error(tr("roomUnavailableToast"));
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
            // One width for all three views, so the dialog does not jump between them.
            "max-h-[85vh] sm:max-w-md",
            // grid-cols-1, not the grid's default auto column: that one grows to
            // its widest content (a row of many thumbnails, a long house name)
            // and pushed the dialog past the screen.
            // The picker's 44px days need the narrower phone padding to fit 7 across.
            pickRoom
              ? "grid-cols-1 overflow-y-auto p-4 sm:p-6"
              : showDetail
                ? "flex flex-col gap-0 p-0"
                : "grid-cols-1 overflow-y-auto",
          )}
        >
          {pickRoom ? (
            <>
              <BackHeader
                title={tb("selectDates")}
                description={pickRoom.name}
                onBack={() => {
                  if (!detailRoomId) returnFocus.current = `book:${pickRoom.id}`;
                  cancelPick();
                }}
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
              onBack={() => {
                returnFocus.current = `details:${detailRoom.id}`;
                setDetailRoomId(null);
              }}
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

              {/* Every row has the same two-line shape (name, then status), so
                  booked and free rows are the same height. */}
              <ul className="divide-y divide-line">
                {breakdown.map((row) => {
                  // Only houses with a unit left that night can be opened or
                  // booked — a booked or closed one has nothing to book.
                  const bookable = !row.blocked && row.free > 0;
                  return (
                    <li key={row.roomId} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-base font-semibold", bookable ? "text-ink" : "text-ink-3")}>
                          {roomNameById.get(row.roomId)}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-sm">
                          <RoomStatusText row={row} />
                          {bookable && (
                            <>
                              <span aria-hidden="true" className="text-ink-3">·</span>
                              {/* -my-3 keeps the 44px tap target without making the line 44px tall. */}
                              <button
                                type="button"
                                ref={focusOnReturn(`details:${row.roomId}`)}
                                onClick={() => setDetailRoomId(row.roomId)}
                                className="-my-3 inline-flex min-h-11 min-w-0 items-center truncate text-ink-2 underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                              >
                                {t("viewDetails")}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Secondary, like the house card's "วันว่าง & ราคา": one
                          filled button per row read as a wall of CTAs. */}
                      {bookable && (
                        <button
                          type="button"
                          ref={focusOnReturn(`book:${row.roomId}`)}
                          className="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-line-strong bg-white px-5 text-sm font-medium text-ink transition-colors hover:bg-mist outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
                          onClick={() => handleBook(row.roomId)}
                        >
                          {t("bookThisHouse")}
                        </button>
                      )}
                    </li>
                  );
                })}
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
