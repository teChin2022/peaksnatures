"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import { useIsMobile } from "@/lib/use-is-mobile";
import Image from "next/image";
import { startOfToday, addMonths, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { Room, RoomSeasonalPrice, BlockedDate } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarDays, CalendarSearch, ChevronLeft, ChevronRight, X } from "lucide-react";

import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { getPriceRange } from "@/lib/calculate-price";
import { getFullyBookedForRoom } from "@/lib/booking-dates";
import { HTMLContent } from "@/components/ui/html-content";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2UyZThmMCIvPjwvc3ZnPg==";


function RoomLightbox({ images, name, startIndex, onClose }: { images: string[]; name: string; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const prevImage = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const nextImage = useCallback(() => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);
  useSwipe(containerEl, { onSwipeLeft: nextImage, onSwipeRight: prevImage });

  return (
    <div ref={setContainerEl} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-2xl p-4" style={{ touchAction: "none" }}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 text-white hover:bg-white/20"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 text-white hover:bg-white/20"
        onClick={prevImage}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <div className="flex h-[85vh] w-[90vw] max-w-5xl items-center justify-center">
        <Image
          key={images[index]}
          src={images[index]}
          alt={`${name} photo ${index + 1}`}
          width={1920}
          height={1080}
          sizes="90vw"
          priority
          className="max-h-[85vh] max-w-full h-auto w-auto rounded-2xl"
        />
      </div>

      {/* Preload adjacent images */}
      {images.length > 1 && (
        <div className="hidden">
          {index > 0 && (
            <Image src={images[index - 1]} alt="" width={32} height={32} />
          )}
          {index < images.length - 1 && (
            <Image src={images[index + 1]} alt="" width={32} height={32} />
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 text-white hover:bg-white/20"
        onClick={nextImage}
      >
        <ChevronRight className="h-8 w-8" />
      </Button>

      <div className="absolute bottom-6 text-sm text-white/70">
        {index + 1} / {images.length}
      </div>
    </div>
  );
}

interface BookedRange {
  room_id: string | null;
  check_in: string;
  check_out: string;
}

const EMPTY_SEASONAL_PRICES: RoomSeasonalPrice[] = [];
const EMPTY_BOOKED_RANGES: BookedRange[] = [];
const EMPTY_BLOCKED_DATES: BlockedDate[] = [];

interface RoomsSectionProps {
  rooms: Room[];
  seasonalPrices?: RoomSeasonalPrice[];
  bookedRanges?: BookedRange[];
  blockedDates?: BlockedDate[];
}

export function RoomsSection({ rooms, seasonalPrices = EMPTY_SEASONAL_PRICES, bookedRanges = EMPTY_BOOKED_RANGES, blockedDates = EMPTY_BLOCKED_DATES }: RoomsSectionProps) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");

  const seasonsByRoom = useMemo(() => {
    const map: Record<string, RoomSeasonalPrice[]> = {};
    for (const s of seasonalPrices) {
      if (!map[s.room_id]) map[s.room_id] = [];
      map[s.room_id].push(s);
    }
    return map;
  }, [seasonalPrices]);

  if (!rooms.length) return null;

  return (
    <section id="rooms-section" className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="overflow-hidden pt-2 -mt-2">
          <motion.h2
            initial={{ y: "100%" }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
            className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight"
          >
            {t("title")}
          </motion.h2>
        </div>
        <p className="mt-2 text-sm text-earth-500">
          {t("subtitle")}
        </p>

        <RoomCards rooms={rooms} seasonsByRoom={seasonsByRoom} bookedRanges={bookedRanges} blockedDates={blockedDates} />

      </div>
    </section>
  );
}

function getFullyBookedDates(roomId: string, rooms: Room[], bookedRanges: BookedRange[]) {
  const roomObj = rooms.find((r) => r.id === roomId);
  return getFullyBookedForRoom(roomId, roomObj?.quantity || 1, bookedRanges);
}

function RoomPriceDisplay({ room, seasonalPrices }: { room: Room; seasonalPrices: RoomSeasonalPrice[] }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const { min, max } = getPriceRange(room.price_per_night, seasonalPrices);
  const hasRange = min !== max;
  return (
    <div className="flex items-center gap-1">
      {hasRange ? (
        <>
          <span className="text-xs text-earth-400 self-end mb-1">{t("fromPrice")}</span>
          <span className="text-2xl font-bold text-earth-900">
            ฿{min.toLocaleString()}
          </span>
        </>
      ) : (
        <span className="text-2xl font-bold text-earth-900">
          ฿{room.price_per_night.toLocaleString()}
        </span>
      )}
      <span className="text-xs text-earth-400 self-end mb-1">{tc("perNight")}</span>
    </div>
  );
}

function RoomDescriptionWithReadMore({ content, onReadMore }: { content: string; onReadMore: () => void }) {
  const t = useTranslations("rooms");
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      setOverflows(el.scrollHeight > el.clientHeight);
    }
  }, [content]);

  return (
    <>
      <div ref={ref} className="line-clamp-5">
        <HTMLContent content={content} className="mt-2 text-sm leading-relaxed text-earth-500" />
      </div>
      {overflows && (
        <button
          type="button"
          className="mt-1 text-left text-sm font-medium text-earth-900 underline underline-offset-4 hover:text-earth-600"
          onClick={onReadMore}
        >
          {t("readMore")}
        </button>
      )}
    </>
  );
}

function SingleRoomHero({
  room,
  seasonalPrices,
  onLightbox,
  onCalendar,
  onDesc,
}: {
  room: Room;
  seasonalPrices: RoomSeasonalPrice[];
  onLightbox: () => void;
  onCalendar: () => void;
  onDesc: () => void;
}) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const [index, setIndex] = useState(0);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const images = room.images;
  const multi = images.length > 1;

  const prev = useCallback(() => {
    setIndex((i) => {
      const next = i > 0 ? i - 1 : images.length - 1;
      setSeen((s) => { const n = new Set(s); n.add(next); if (next > 0) n.add(next - 1); else n.add(images.length - 1); if (next < images.length - 1) n.add(next + 1); else n.add(0); return n; });
      return next;
    });
  }, [images.length]);
  const next = useCallback(() => {
    setIndex((i) => {
      const nxt = i < images.length - 1 ? i + 1 : 0;
      setSeen((s) => { const n = new Set(s); n.add(nxt); if (nxt > 0) n.add(nxt - 1); else n.add(images.length - 1); if (nxt < images.length - 1) n.add(nxt + 1); else n.add(0); return n; });
      return nxt;
    });
  }, [images.length]);
  useSwipe(containerEl, { onSwipeLeft: next, onSwipeRight: prev });

  const { min, max } = getPriceRange(room.price_per_night, seasonalPrices);
  const hasRange = min !== max;

  return (
    <motion.div
      data-room-id={room.id}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
      className="mt-6"
    >
      {/* Hero image with overlay */}
      <div
        ref={setContainerEl}
        className="group relative aspect-[4/3] md:aspect-[16/9] lg:aspect-[21/9] overflow-hidden rounded-2xl bg-earth-100"
        style={{ touchAction: "pan-y" }}
      >
        {/* Sliding image strip — only nearby images are mounted to reduce DOM/decode cost */}
        <div
          className="absolute inset-0 flex transition-transform duration-500 ease-out will-change-transform"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {images.map((src, i) => {
            const shouldMount = seen.has(i) || Math.abs(i - index) <= 1 || (index === 0 && i === images.length - 1) || (index === images.length - 1 && i === 0);
            return (
              <div key={src} className="relative h-full w-full shrink-0">
                {shouldMount && (
                  <Image
                    src={src}
                    alt={`${room.name} photo ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
                    priority={i === 0}
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Click area for lightbox */}
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-pointer"
          onClick={onLightbox}
          aria-label="View photos"
        />

        {/* Carousel arrows — hidden on mobile, fade in on hover (desktop) */}
        {multi && (
          <>
            <button
              type="button"
              className="absolute left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 md:flex hover:bg-black/50"
              onClick={(e) => { e.stopPropagation(); prev(); }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 md:flex hover:bg-black/50"
              onClick={(e) => { e.stopPropagation(); next(); }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Dot indicators — mobile only, top of image */}
        {multi && (
          <div className="absolute inset-x-0 top-0 z-10 p-3 bg-gradient-to-b from-black/30 to-transparent md:hidden">
            <div className="flex justify-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "bg-white w-3" : "bg-white/50 w-1.5"}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Dot indicators — desktop/tablet only, top inside image */}
        {multi && (
          <div className="absolute inset-x-0 top-0 z-10 hidden md:flex justify-center gap-1.5 pt-3 pb-6 bg-gradient-to-b from-black/20 to-transparent">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`rounded-full transition-all ${i === index ? "bg-white w-3 h-1.5" : "bg-white/50 w-1.5 h-1.5 hover:bg-white/80"}`}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              />
            ))}
          </div>
        )}

        {/* Bottom gradient overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Overlaid content */}
        <div className="absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-3 p-5 md:p-8">
          {/* Bottom row: info left, CTA right */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            {/* Left: name + price + badges */}
            <div className="min-w-0">
              <h3 className="text-2xl md:text-3xl font-serif text-white tracking-tight drop-shadow-lg">{room.name}</h3>
              <div className="mt-1 flex items-baseline gap-1.5">
                {hasRange && <span className="text-xs text-white/70">{t("fromPrice")}</span>}
                <span className="text-xl md:text-2xl font-bold text-white drop-shadow-sm">
                  ฿{(hasRange ? min : room.price_per_night).toLocaleString()}
                </span>
                <span className="text-xs text-white/70">{tc("perNight")}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-white/90 backdrop-blur-sm">
                  <Users className="h-3.5 w-3.5" />
                  {tc("guests")} {room.max_guests}
                </span>
                <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-white/90 backdrop-blur-sm">
                  {t("available", { count: room.quantity })}
                </span>
                {room.description && (
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-white/90 backdrop-blur-sm underline underline-offset-2 hover:bg-white/25 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onDesc(); }}
                  >
                    {t("readMore")}
                  </button>
                )}
              </div>
            </div>

            {/* Right: CTA buttons — desktop only (inside overlay) */}
            <div className="hidden shrink-0 rounded-full overflow-hidden shadow-lg sm:flex">
              <Button
                className="rounded-none rounded-l-full bg-brand text-white px-8 py-3.5 h-auto font-bold text-sm tracking-widest uppercase hover:bg-brand-hover border-0"
                onClick={(e) => {
                  e.stopPropagation();
                  document.dispatchEvent(new CustomEvent("book-room", { detail: { roomId: room.id } }));
                }}
              >
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                {t("bookRoom")}
              </Button>
              <button
                type="button"
                className="flex items-center justify-center px-4 rounded-r-full bg-brand hover:bg-brand-hover border-l border-white/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); onCalendar(); }}
                title={t("viewCalendar")}
              >
                <CalendarSearch className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile CTA — outside image */}
      <div className="mt-3 mb-15 flex w-full rounded-full overflow-hidden shadow-lg sm:hidden">
        <Button
          className="flex-1 rounded-none rounded-l-full bg-brand text-white px-8 py-3.5 h-auto font-bold text-sm tracking-widest uppercase hover:bg-brand-hover border-0"
          onClick={() => {
            document.dispatchEvent(new CustomEvent("book-room", { detail: { roomId: room.id } }));
          }}
        >
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          {t("bookRoom")}
        </Button>
        <button
          type="button"
          className="flex items-center justify-center px-4 rounded-r-full bg-brand hover:bg-brand-hover border-l border-white/30 transition-colors"
          onClick={() => onCalendar()}
          title={t("viewCalendar")}
        >
          <CalendarSearch className="h-3.5 w-3.5 text-white" />
        </button>
      </div>

    </motion.div>
  );
}

function RoomCards({ rooms, seasonsByRoom, bookedRanges, blockedDates }: { rooms: Room[]; seasonsByRoom: Record<string, RoomSeasonalPrice[]>; bookedRanges: BookedRange[]; blockedDates: BlockedDate[] }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const [lightbox, setLightbox] = useState<{ images: string[]; name: string } | null>(null);
  const [calendarRoomId, setCalendarRoomId] = useState<string | null>(null);
  const [descRoomId, setDescRoomId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const locale = useLocale();

  const calendarRoom = calendarRoomId ? rooms.find((r) => r.id === calendarRoomId) : null;

  const disabledDates = useMemo(() => {
    if (!calendarRoomId) return [];
    const fullyBooked = getFullyBookedDates(calendarRoomId, rooms, bookedRanges);
    const blocked = new Set(
      blockedDates
        .filter((d) => d.room_id === null || d.room_id === calendarRoomId)
        .map((d) => d.date)
    );
    const allDisabled = new Set([...fullyBooked, ...blocked]);
    return Array.from(allDisabled).map((d) => parseISO(d));
  }, [calendarRoomId, rooms, bookedRanges, blockedDates]);

  return (
    <>
      <div className="mt-6 space-y-6">
        {rooms.map((room) => (
          <SingleRoomHero
            key={room.id}
            room={room}
            seasonalPrices={seasonsByRoom[room.id] || []}
            onLightbox={() => setLightbox({ images: room.images, name: room.name })}
            onCalendar={() => setCalendarRoomId(room.id)}
            onDesc={() => setDescRoomId(room.id)}
          />
        ))}
      </div>

      {lightbox && (
        <RoomLightbox
          images={lightbox.images}
          name={lightbox.name}
          startIndex={0}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Room Description Modal */}
      <Dialog open={!!descRoomId} onOpenChange={(open) => { if (!open) setDescRoomId(null); }}>
        <DialogContent className="sm:max-w-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{descRoomId ? rooms.find((r) => r.id === descRoomId)?.name : ""}</DialogTitle>
            <DialogDescription className="sr-only">
              {descRoomId ? rooms.find((r) => r.id === descRoomId)?.name : ""}
            </DialogDescription>
          </DialogHeader>
          {descRoomId && rooms.find((r) => r.id === descRoomId)?.description && (
            <HTMLContent
              content={rooms.find((r) => r.id === descRoomId)!.description!}
              className="leading-relaxed text-earth-600"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!calendarRoomId} onOpenChange={(open) => { if (!open) setCalendarRoomId(null); }}>
        <DialogContent className="sm:max-w-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("availabilityTitle")}</DialogTitle>
            <DialogDescription>
              {calendarRoom?.name}
            </DialogDescription>
          </DialogHeader>
          <Calendar
            mode="single"
            numberOfMonths={1}
            locale={locale === "th" ? thLocale : undefined}
            captionLayout="dropdown"
            startMonth={startOfToday()}
            endMonth={addMonths(startOfToday(), 12)}
            formatters={locale === "th" ? {
              formatMonthDropdown: (date) =>
                date.toLocaleDateString("th-TH", { month: "long" }),
              formatYearDropdown: (date) =>
                String(date.getFullYear() + 543),
            } : undefined}
            disabled={[
              { before: new Date() },
              ...disabledDates,
            ]}
            modifiers={{
              booked: disabledDates,
            }}
            modifiersClassNames={{
              booked: "[&_.day-btn]:bg-red-100! [&_.day-btn]:hover:bg-red-100! [&_.day-btn]:text-red-400! [&_.day-btn]:opacity-100! [&_.day-btn]:rounded-full",
            }}
            className="rounded-md border w-full"
          />
          <div className="flex items-center justify-center gap-4 text-xs text-earth-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-100 border border-red-200" />
              {t("legendBooked")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-white border border-earth-200" />
              {t("legendAvailable")}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
