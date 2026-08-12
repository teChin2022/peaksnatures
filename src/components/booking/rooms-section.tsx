"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import { useIsMobile } from "@/lib/use-is-mobile";
import Image from "next/image";
import { startOfToday, addMonths, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { Room, RoomSeasonalPrice, BlockedDate } from "@/types/database";

type BookingStep = "dates" | "details" | "payment";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarSearch, ChevronLeft, ChevronRight, X, Sparkles, Wrench, ShoppingCart } from "lucide-react";
import { fmtDateStr } from "@/lib/format-date";

import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBookingCartOptional, type CartLine } from "@/components/booking/booking-cart-context";
import { RoomConfigDialog } from "@/components/booking/room-config-dialog";
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
const EMPTY_POPULAR_IDS: ReadonlySet<string> = new Set();

interface RoomsSectionProps {
  rooms: Room[];
  seasonalPrices?: RoomSeasonalPrice[];
  bookedRanges?: BookedRange[];
  blockedDates?: BlockedDate[];
  popularRoomIds?: ReadonlySet<string>;
}

export function RoomsSection({ rooms, seasonalPrices = EMPTY_SEASONAL_PRICES, bookedRanges = EMPTY_BOOKED_RANGES, blockedDates = EMPTY_BLOCKED_DATES, popularRoomIds = EMPTY_POPULAR_IDS }: RoomsSectionProps) {
  const t = useTranslations("rooms");

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

        <RoomCards rooms={rooms} seasonsByRoom={seasonsByRoom} bookedRanges={bookedRanges} blockedDates={blockedDates} popularRoomIds={popularRoomIds} />

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
  onAddToCart,
  cartEnabled,
  bookingLocked,
  isPopular,
  unavailableForDates,
  datesChosen,
}: {
  room: Room;
  seasonalPrices: RoomSeasonalPrice[];
  onLightbox: () => void;
  onCalendar: () => void;
  onDesc: () => void;
  onAddToCart: () => void;
  cartEnabled: boolean;
  bookingLocked: boolean;
  isPopular?: boolean;
  unavailableForDates?: boolean;
  datesChosen?: boolean;
}) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const [index, setIndex] = useState(0);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const [overlayHidden, setOverlayHidden] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const handleSwipeStart = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setOverlayHidden(true);
  }, []);
  const scheduleShow = useCallback(() => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => setOverlayHidden(false), 3000);
  }, []);
  useEffect(() => () => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
  }, []);
  useSwipe(containerEl, {
    onSwipeLeft: next,
    onSwipeRight: prev,
    onSwipeStart: handleSwipeStart,
    onSwipeEnd: scheduleShow,
  });

  const { min, max } = getPriceRange(room.price_per_night, seasonalPrices);
  const hasRange = min !== max;

  if (!room.is_active) {
    const cover = images[0];
    return (
      <motion.div
        data-room-id={room.id}
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0, 1] }}
        className="mt-6"
      >
        <div
          aria-disabled="true"
          className="relative aspect-[4/3] md:aspect-[16/9] lg:aspect-[21/9] overflow-hidden rounded-2xl bg-earth-100"
        >
          {cover && (
            <Image
              src={cover}
              alt={room.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              className="h-full w-full object-cover grayscale opacity-60"
            />
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-earth-900/85 via-earth-900/40 to-earth-900/20" />

          <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-4 p-6 text-center">
            <h3 className="text-2xl md:text-3xl font-serif text-white tracking-tight drop-shadow-lg">{room.name}</h3>
            <div className="inline-flex items-center gap-2 rounded-full bg-earth-900/70 backdrop-blur-md px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 shadow-lg">
              <Wrench className="h-4 w-4" />
              <span>{t("temporarilyClosed")}</span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

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
        {isPopular && (
          <span className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg ring-1 ring-black/5">
            <Sparkles className="h-3 w-3" />
            {t("popular")}
          </span>
        )}
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

        {/* Dot indicators — top of image, identical on mobile and desktop. The button's
            padding grows the tap target; the matching negative margins cancel it out of
            layout, so the dots keep the tight gap-1.5 pitch. */}
        {multi && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-1.5 pt-3 pb-6 bg-gradient-to-b from-black/20 to-transparent">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t("goToPhoto", { number: i + 1 })}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className="px-1 -mx-1 py-2 -my-2"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${i === index ? "bg-white w-3" : "bg-white/50 w-1.5 pointer-fine:hover:bg-white/80"}`}
                />
              </button>
            ))}
          </div>
        )}

        {/* Bottom gradient overlay */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300 ease-out md:opacity-100 ${overlayHidden ? "opacity-0" : "opacity-100"}`}
        />

        {/* Overlaid content */}
        <div
          className={`absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-3 p-5 md:p-8 transition-all duration-300 ease-out md:opacity-100 md:translate-y-0 md:pointer-events-auto ${overlayHidden ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"}`}
        >
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
            <div className="hidden shrink-0 flex-col items-stretch gap-2 sm:flex">
              {cartEnabled && (
                <Button
                  disabled={bookingLocked || unavailableForDates || !datesChosen}
                  className="rounded-full bg-brand text-white px-6 py-3.5 h-auto font-bold text-sm tracking-widest uppercase hover:bg-brand-hover border-0 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(e) => { e.stopPropagation(); onAddToCart(); }}
                >
                  {unavailableForDates ? (
                    t("unavailableForDates")
                  ) : (
                    <>
                      <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                      {t("selectThisRoom")}
                    </>
                  )}
                </Button>
              )}
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-full bg-white/90 px-5 py-3 border border-white/50 shadow-lg transition-colors text-sm font-bold tracking-widest uppercase text-earth-800 hover:bg-white"
                onClick={(e) => { e.stopPropagation(); onCalendar(); }}
              >
                <CalendarSearch className="h-3.5 w-3.5" />
                {t("viewCalendar")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile CTA — outside image */}
      <div className="mt-3 mb-15 flex w-full flex-col gap-2 sm:hidden">
        {cartEnabled && (
          <Button
            disabled={bookingLocked || unavailableForDates || !datesChosen}
            className="w-full rounded-full bg-brand text-white px-8 py-3.5 h-auto font-bold text-sm tracking-widest uppercase shadow-lg hover:bg-brand-hover border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onAddToCart()}
          >
            {unavailableForDates ? (
              t("unavailableForDates")
            ) : (
              <>
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                {t("selectThisRoom")}
              </>
            )}
          </Button>
        )}
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-earth-300 bg-white px-5 py-3.5 text-sm font-bold tracking-widest uppercase text-earth-800 shadow-sm transition-colors hover:bg-earth-50"
          onClick={() => onCalendar()}
        >
          <CalendarSearch className="h-3.5 w-3.5" />
          {t("viewCalendar")}
        </button>
      </div>

    </motion.div>
  );
}

function RoomCards({ rooms, seasonsByRoom, bookedRanges, blockedDates, popularRoomIds }: { rooms: Room[]; seasonsByRoom: Record<string, RoomSeasonalPrice[]>; bookedRanges: BookedRange[]; blockedDates: BlockedDate[]; popularRoomIds: ReadonlySet<string> }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const [lightbox, setLightbox] = useState<{ images: string[]; name: string } | null>(null);
  const [calendarRoomId, setCalendarRoomId] = useState<string | null>(null);
  const [descRoomId, setDescRoomId] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>("dates");
  const isMobile = useIsMobile();
  const locale = useLocale();
  const cart = useBookingCartOptional();
  const [config, setConfig] = useState<{ room: Room; editingLine?: CartLine } | null>(null);

  const handleAddToCart = (room: Room) => {
    if (!cart) return;
    if (!cart.dateRange?.from || !cart.dateRange?.to) return; // room button is disabled until dates are chosen
    if (!cart.isRoomAvailableForRange(room) || cart.remainingForRoom(room) <= 0) {
      toast.error(t("roomUnavailableToast"));
      return;
    }
    setConfig({ room });
  };

  // Reopen the config dialog in edit mode when a cart line requests it
  // (CartLineList dispatches `edit-line` with the lineId). Only while still
  // choosing rooms — once payment is underway the cart is locked.
  useEffect(() => {
    if (!cart) return;
    const handler = (e: Event) => {
      if (bookingStep !== "dates") return;
      const { lineId } = (e as CustomEvent<{ lineId: string }>).detail;
      const line = cart.lines.find((l) => l.lineId === lineId);
      if (!line) return;
      const room = rooms.find((r) => r.id === line.roomId);
      if (room) setConfig({ room, editingLine: line });
    };
    document.addEventListener("edit-line", handler);
    return () => document.removeEventListener("edit-line", handler);
  }, [cart, rooms, bookingStep]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { step } = (e as CustomEvent<{ step: BookingStep }>).detail;
      setBookingStep(step);
    };
    document.addEventListener("booking-step", handler);
    return () => document.removeEventListener("booking-step", handler);
  }, []);

  const bookingLocked = bookingStep !== "dates";

  const calendarRoom = calendarRoomId ? rooms.find((r) => r.id === calendarRoomId) : null;

  // Once dates are chosen, only show rooms that are actually available for them
  // (hide rooms fully booked or blocked for the selected range).
  const datesChosen = !!cart?.dateRange?.from && !!cart?.dateRange?.to;
  const visibleRooms = datesChosen && cart ? rooms.filter((room) => cart.isRoomAvailableForRange(room)) : rooms;

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
        {visibleRooms.map((room) => (
          <SingleRoomHero
            key={room.id}
            room={room}
            seasonalPrices={seasonsByRoom[room.id] || []}
            onLightbox={() => setLightbox({ images: room.images, name: room.name })}
            onCalendar={() => setCalendarRoomId(room.id)}
            onDesc={() => setDescRoomId(room.id)}
            onAddToCart={() => handleAddToCart(room)}
            cartEnabled={!!cart}
            bookingLocked={bookingLocked}
            isPopular={popularRoomIds.has(room.id)}
            unavailableForDates={false}
            datesChosen={datesChosen}
          />
        ))}
        {datesChosen && visibleRooms.length === 0 && (
          <div className="rounded-2xl border border-dashed border-earth-300 bg-earth-50 p-8 text-center text-sm text-earth-600">
            {t("noAvailableRooms")}
          </div>
        )}
      </div>

      {lightbox && (
        <RoomLightbox
          images={lightbox.images}
          name={lightbox.name}
          startIndex={0}
          onClose={() => setLightbox(null)}
        />
      )}

      {cart && (
        <RoomConfigDialog
          key={config?.editingLine?.lineId ?? config?.room.id ?? "none"}
          room={config?.room ?? null}
          editingLine={config?.editingLine ?? null}
          open={!!config}
          onClose={() => setConfig(null)}
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

          {calendarRoom && (
            <div className="mt-5 rounded-2xl bg-earth-50 px-5 py-5">
              {/* Eyebrow + hairline */}
              <div className="mb-4 flex items-center gap-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-earth-500">
                  {t("priceDetailsTitle")}
                </h4>
                <div className="h-px flex-1 bg-earth-200" />
              </div>

              {/* Base price — the anchor */}
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-earth-800">
                  {t("basePrice")}
                </span>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-2xl font-bold text-earth-900">
                    ฿{calendarRoom.price_per_night.toLocaleString()}
                  </span>
                  <span className="text-xs text-earth-500">{tc("perNight")}</span>
                </div>
              </div>

              {/* Seasonal rates */}
              {(seasonsByRoom[calendarRoom.id] || []).length > 0 && (
                <div className="mt-5 border-t border-dashed border-earth-300 pt-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-brand" strokeWidth={2.5} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-earth-500">
                      {t("seasonalRates")}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {(seasonsByRoom[calendarRoom.id] || [])
                      .slice()
                      .sort((a, b) => a.start_date.localeCompare(b.start_date))
                      .map((s) => (
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
