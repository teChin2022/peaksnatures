"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import { useIsMobile } from "@/lib/use-is-mobile";
import Image from "next/image";
import { startOfToday, addMonths, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { Room, RoomSeasonalPrice, RoomSpecialPrice, BlockedDate } from "@/types/database";

type BookingStep = "dates" | "details" | "payment";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarSearch, ChevronLeft, ChevronRight, X, Sparkles, Wrench, ShoppingCart, Check } from "lucide-react";
import { roomCtaState } from "@/components/booking/room-cta-state";
import { fmtDateStr } from "@/lib/format-date";

import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBookingCartOptional, type CartLine } from "@/components/booking/booking-cart-context";
import { RoomConfigDialog } from "@/components/booking/room-config-dialog";
import { getPriceRange } from "@/lib/calculate-price";
import { formatSpecialPriceRule } from "@/lib/special-price-label";
import { getFullyBookedForRoom } from "@/lib/booking-dates";
import { HTMLContent } from "@/components/ui/html-content";
import { thumbScroll } from "@/components/booking/gallery-section";
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


export function RoomLightbox({ images, name, startIndex, onClose }: { images: string[]; name: string; startIndex: number; onClose: () => void }) {
  const t = useTranslations("rooms");
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
        className="absolute right-4 top-4 z-10 text-white hover:bg-white/20"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 z-10 text-white hover:bg-white/20"
        onClick={prevImage}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <div className="flex h-[85vh] w-[90vw] max-w-5xl items-center justify-center">
        <div className="relative flex max-h-[85vh] max-w-full overflow-hidden rounded-2xl">
          <Image
            key={images[index]}
            src={images[index]}
            alt={`${name} photo ${index + 1}`}
            width={1920}
            height={1080}
            sizes="90vw"
            priority
            className="max-h-[85vh] max-w-full h-auto w-auto"
          />
          {/* Thumbnail strip, same as the landing gallery's viewer. */}
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={t("goToPhoto", { number: i + 1 })}
                  aria-current={i === index}
                  onClick={() => setIndex(i)}
                  ref={(el) => {
                    if (i === index) el?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: thumbScroll() });
                  }}
                  className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-md outline-none ring-2 transition-[opacity,transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-white motion-reduce:transition-none sm:h-14 sm:w-20 ${
                    i === index ? "scale-100 ring-white" : "scale-90 opacity-70 ring-transparent hover:opacity-100"
                  }`}
                >
                  <Image src={img} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
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
const EMPTY_SPECIAL_PRICES: RoomSpecialPrice[] = [];
const EMPTY_BOOKED_RANGES: BookedRange[] = [];
const EMPTY_BLOCKED_DATES: BlockedDate[] = [];
const EMPTY_POPULAR_IDS: ReadonlySet<string> = new Set();

interface RoomsSectionProps {
  rooms: Room[];
  seasonalPrices?: RoomSeasonalPrice[];
  specialPrices?: RoomSpecialPrice[];
  bookedRanges?: BookedRange[];
  blockedDates?: BlockedDate[];
  popularRoomIds?: ReadonlySet<string>;
}

export function RoomsSection({ rooms, seasonalPrices = EMPTY_SEASONAL_PRICES, specialPrices = EMPTY_SPECIAL_PRICES, bookedRanges = EMPTY_BOOKED_RANGES, blockedDates = EMPTY_BLOCKED_DATES, popularRoomIds = EMPTY_POPULAR_IDS }: RoomsSectionProps) {
  const t = useTranslations("rooms");

  const seasonsByRoom = useMemo(() => {
    const map: Record<string, RoomSeasonalPrice[]> = {};
    for (const s of seasonalPrices) {
      if (!map[s.room_id]) map[s.room_id] = [];
      map[s.room_id].push(s);
    }
    return map;
  }, [seasonalPrices]);

  const specialsByRoom = useMemo(() => {
    const map: Record<string, RoomSpecialPrice[]> = {};
    for (const s of specialPrices) {
      if (!map[s.room_id]) map[s.room_id] = [];
      map[s.room_id].push(s);
    }
    return map;
  }, [specialPrices]);

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
            className="text-2xl md:text-3xl font-serif text-ink tracking-tight"
          >
            {t("title")}
          </motion.h2>
        </div>
        <p className="mt-2 text-sm text-ink-3">
          {t("subtitle")}
        </p>

        <RoomCards rooms={rooms} seasonsByRoom={seasonsByRoom} specialsByRoom={specialsByRoom} bookedRanges={bookedRanges} blockedDates={blockedDates} popularRoomIds={popularRoomIds} />

      </div>
    </section>
  );
}

function getFullyBookedDates(roomId: string, rooms: Room[], bookedRanges: BookedRange[]) {
  const roomObj = rooms.find((r) => r.id === roomId);
  return getFullyBookedForRoom(roomId, roomObj?.quantity || 1, bookedRanges);
}

function RoomPriceDisplay({ room, seasonalPrices, specialPrices }: { room: Room; seasonalPrices: RoomSeasonalPrice[]; specialPrices: RoomSpecialPrice[] }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const { min, max } = getPriceRange({ basePricePerNight: room.price_per_night, seasons: seasonalPrices, specialPrices });
  const hasRange = min !== max;
  return (
    <div className="flex items-center gap-1">
      {hasRange ? (
        <>
          <span className="text-xs text-ink-3 self-end mb-1">{t("fromPrice")}</span>
          <span className="text-2xl font-bold text-ink">
            ฿{min.toLocaleString()}
          </span>
        </>
      ) : (
        <span className="text-2xl font-bold text-ink">
          ฿{room.price_per_night.toLocaleString()}
        </span>
      )}
      <span className="text-xs text-ink-3 self-end mb-1">{tc("perNight")}</span>
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
    <div>
      <div ref={ref} className="line-clamp-3">
        <HTMLContent content={content} className="text-[15px] leading-relaxed text-ink-2" />
      </div>
      {overflows && (
        <button
          type="button"
          className="mt-1 inline-flex min-h-11 items-center rounded-sm text-left text-sm font-medium text-pine underline underline-offset-4 hover:text-pine-hover outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
          onClick={onReadMore}
        >
          {t("readMore")}
        </button>
      )}
    </div>
  );
}

const CARD_ENTRANCE = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, ease: [0.25, 0.1, 0, 1] as const },
};

/**
 * One house on /book: a white card with its photos (swipe, arrows, thumbnails,
 * tap for the lightbox) and, below on phones or beside from md, the name,
 * description, facts, price and the two actions. The main button's state comes
 * from roomCtaState and stays disabled until both dates are chosen.
 */
export function SingleRoomHero({
  room,
  seasonalPrices,
  specialPrices,
  onLightbox,
  onCalendar,
  onDesc,
  onAddToCart,
  onEdit,
  cartEnabled,
  bookingLocked,
  isPopular,
  unavailableForDates,
  datesChosen,
  remaining = 0,
  inCart = 0,
}: {
  room: Room;
  seasonalPrices: RoomSeasonalPrice[];
  specialPrices: RoomSpecialPrice[];
  onLightbox: () => void;
  onCalendar: () => void;
  onDesc: () => void;
  onAddToCart: () => void;
  /** Opens the room's cart line for editing (used once every free unit is in the cart). */
  onEdit: () => void;
  cartEnabled: boolean;
  bookingLocked: boolean;
  isPopular?: boolean;
  unavailableForDates?: boolean;
  datesChosen?: boolean;
  /** Units still bookable for the chosen dates; only meaningful once dates are chosen. */
  remaining?: number;
  /** Units of this house already in the cart. */
  inCart?: number;
}) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const ta = useTranslations("about");
  const [index, setIndex] = useState(0);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const images = room.images;
  const multi = images.length > 1;

  // Mounts the shown photo and its neighbours, so a swipe never lands on an empty frame.
  const goTo = useCallback(
    (i: number) => {
      const n = images.length;
      const at = ((i % n) + n) % n;
      setIndex(at);
      setSeen((s) => new Set([...s, at, (at + 1) % n, (at - 1 + n) % n]));
    },
    [images.length],
  );
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  useSwipe(containerEl, { onSwipeLeft: next, onSwipeRight: prev });

  const { min, max } = getPriceRange({ basePricePerNight: room.price_per_night, seasons: seasonalPrices, specialPrices });
  const hasRange = min !== max;
  const ctaState = roomCtaState({ datesChosen: !!datesChosen, inCart, remaining });

  if (!room.is_active) {
    const cover = images[0];
    return (
      <motion.div data-room-id={room.id} {...CARD_ENTRANCE} aria-disabled="true" className="grid overflow-hidden rounded-[20px] bg-white md:grid-cols-[52%_1fr]">
        <div className="relative aspect-[4/3] bg-mist-2 md:aspect-auto md:min-h-[280px]">
          {cover && (
            <Image src={cover} alt={room.name} fill sizes="(max-width: 768px) 100vw, 52vw" placeholder="blur" blurDataURL={BLUR_DATA_URL} className="object-cover opacity-60 grayscale" />
          )}
        </div>
        <div className="flex flex-col justify-center gap-3 p-5 md:p-7">
          <h3 className="font-serif text-2xl text-ink md:text-[28px]">{room.name}</h3>
          <p className="inline-flex items-center gap-2 text-sm text-ink-2">
            <Wrench className="h-4 w-4 shrink-0" />
            {t("temporarilyClosed")}
          </p>
        </div>
      </motion.div>
    );
  }

  const mainLabel = unavailableForDates ? (
    t("unavailableForDates")
  ) : ctaState === "edit" ? (
    <>
      <Check className="h-4 w-4" />
      {t("inCartEdit")}
    </>
  ) : (
    <>
      <ShoppingCart className="h-4 w-4" />
      {t("selectThisRoom")}
    </>
  );

  return (
    <motion.div
      data-room-id={room.id}
      {...CARD_ENTRANCE}
      // In the cart: a Pine outline, so the guest sees at a glance which houses are chosen.
      className={`grid overflow-hidden rounded-[20px] bg-white md:grid-cols-[52%_1fr] ${inCart > 0 ? "ring-[1.5px] ring-inset ring-pine" : ""}`}
    >
      {/* Photos */}
      <div className="relative min-w-0">
        <div
          ref={setContainerEl}
          className="group relative aspect-[4/3] overflow-hidden bg-mist-2 md:aspect-auto md:h-full md:min-h-[380px]"
          style={{ touchAction: "pan-y" }}
        >
          {/* Sliding image strip — only nearby images are mounted to reduce DOM/decode cost */}
          <div
            className="absolute inset-0 flex transition-transform duration-500 ease-out will-change-transform motion-reduce:transition-none"
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
                      sizes="(max-width: 768px) 100vw, 52vw"
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
          <button type="button" className="absolute inset-0 z-[1] cursor-pointer" onClick={onLightbox} aria-label="View photos" />

          {isPopular && (
            <span className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-[#FCEFC7] px-3 py-1 text-xs font-semibold text-[#7A4D00]">
              <Sparkles className="h-3 w-3" />
              {t("popular")}
            </span>
          )}

          {multi && (
            <>
              {/* Arrows from md, shown on hover or focus; phones swipe. */}
              <button
                type="button"
                aria-label={t("prevPhoto")}
                className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:flex outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={(e) => { e.stopPropagation(); prev(); }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={t("nextPhoto")}
                className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:flex outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={(e) => { e.stopPropagation(); next(); }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 z-10 rounded-full bg-black/70 px-2.5 py-0.5 text-xs text-white tabular-nums">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </div>

        {/* Thumbnails: a row under the photo on phones, over its bottom edge from md. */}
        {multi && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-3 [scrollbar-width:none] md:absolute md:bottom-0 md:left-0 md:z-10 md:max-w-[75%] md:p-3">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={t("goToPhoto", { number: i + 1 })}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={`relative h-10 w-14 shrink-0 overflow-hidden rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1 ${
                  i === index ? "opacity-100 ring-2 ring-pine md:ring-white" : "opacity-60 hover:opacity-100"
                }`}
              >
                <Image src={src} alt="" fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details. A container, so the two actions sit side by side only when the card itself has room. */}
      <div className="@container flex min-w-0 flex-col gap-2.5 p-5 md:p-7">
        <h3 className="font-serif text-2xl leading-snug text-ink md:text-[28px]">{room.name}</h3>
        {room.description && <RoomDescriptionWithReadMore content={room.description} onReadMore={onDesc} />}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {ta("upToGuests", { count: room.max_guests })}
          </span>
          {datesChosen && remaining > 0 && <span>{t("available", { count: remaining })}</span>}
          {inCart > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pine-mist px-2.5 py-1 font-medium text-pine-deep">
              <Check className="h-3.5 w-3.5" />
              {t("selectedCount", { count: inCart })}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
          <p className="whitespace-nowrap">
            {hasRange && <span className="mr-1.5 text-[13px] text-ink-2">{t("fromPrice")}</span>}
            {/* Lining figures: the serif's old-style ones read "฿100" as "฿1OO". */}
            <span className="font-serif text-3xl leading-tight text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
              ฿{(hasRange ? min : room.price_per_night).toLocaleString()}
            </span>
            <span className="ml-1 text-[13px] text-ink-2">{tc("perNight")}</span>
          </p>

          <div className="grid gap-2 @md:grid-cols-2">
            {cartEnabled && (
              <Button
                disabled={bookingLocked || unavailableForDates || ctaState === "pick-dates"}
                className={`h-auto min-h-12 gap-2 rounded-full px-5 text-[15px] font-medium shadow-none disabled:cursor-not-allowed disabled:opacity-50 @md:order-2 ${
                  ctaState === "edit"
                    ? "border border-pine bg-pine-mist text-pine-deep hover:bg-pine-mist/70"
                    : "border-0 bg-pine text-white hover:bg-pine-hover"
                }`}
                onClick={() => (ctaState === "edit" ? onEdit() : onAddToCart())}
              >
                {mainLabel}
              </Button>
            )}
            {/* Under the button it explains on phones; under both buttons once they sit side by side. */}
            {cartEnabled && ctaState === "pick-dates" && !bookingLocked && (
              <p className="text-center text-xs text-ink-2 @md:order-3 @md:col-span-2">{t("pickDatesFirst")}</p>
            )}
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-white px-5 @md:order-1 text-[15px] font-medium text-ink transition-colors hover:bg-mist outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
              onClick={onCalendar}
            >
              <CalendarSearch className="h-4 w-4" />
              {t("viewCalendar")}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RoomCards({ rooms, seasonsByRoom, specialsByRoom, bookedRanges, blockedDates, popularRoomIds }: { rooms: Room[]; seasonsByRoom: Record<string, RoomSeasonalPrice[]>; specialsByRoom: Record<string, RoomSpecialPrice[]>; bookedRanges: BookedRange[]; blockedDates: BlockedDate[]; popularRoomIds: ReadonlySet<string> }) {
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

  const handleEditInCart = (room: Room) => {
    const line = cart?.lines.find((l) => l.roomId === room.id);
    if (line) setConfig({ room, editingLine: line });
  };

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
      <div className="mt-8 grid gap-5">
        {visibleRooms.map((room) => (
          <SingleRoomHero
            key={room.id}
            room={room}
            seasonalPrices={seasonsByRoom[room.id] || []}
            specialPrices={specialsByRoom[room.id] || []}
            onLightbox={() => setLightbox({ images: room.images, name: room.name })}
            onCalendar={() => setCalendarRoomId(room.id)}
            onDesc={() => setDescRoomId(room.id)}
            onAddToCart={() => handleAddToCart(room)}
            onEdit={() => handleEditInCart(room)}
            cartEnabled={!!cart}
            bookingLocked={bookingLocked}
            isPopular={popularRoomIds.has(room.id)}
            unavailableForDates={false}
            datesChosen={datesChosen}
            remaining={cart?.remainingForRoom(room)}
            inCart={cart?.countForRoom(room.id) ?? 0}
          />
        ))}
        {datesChosen && visibleRooms.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-mist p-8 text-center text-sm text-ink-2">
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
              className="leading-relaxed text-ink-2"
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
          <div className="flex items-center justify-center gap-4 text-xs text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-100 border border-red-200" />
              {t("legendBooked")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-white border border-line" />
              {t("legendAvailable")}
            </span>
          </div>

          {calendarRoom && (
            <div className="mt-5 rounded-2xl bg-mist px-5 py-5">
              {/* Eyebrow + hairline */}
              <div className="mb-4 flex items-center gap-3">
                <h4 className="text-xs font-semibold text-ink-3">
                  {t("priceDetailsTitle")}
                </h4>
                <div className="h-px flex-1 bg-line" />
              </div>

              {/* Base price — the anchor. Labelled just "price" here (owner, 2026-11-14); the house cards keep "standard rate". */}
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-ink">
                  {t("ratePrice")}
                </span>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-2xl font-bold text-ink">
                    ฿{calendarRoom.price_per_night.toLocaleString()}
                  </span>
                  <span className="text-xs text-ink-3">{tc("perNight")}</span>
                </div>
              </div>

              {/* Special date rates */}
              {(specialsByRoom[calendarRoom.id] || []).length > 0 && (
                <div className="mt-5 border-t border-dashed border-line-strong pt-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-pine" strokeWidth={2.5} />
                    <span className="text-xs font-semibold text-ink-3">
                      {t("specialRates")}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {(specialsByRoom[calendarRoom.id] || []).map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-4">
                        <div className="min-w-0 pr-2">
                          <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                          <div className="mt-0.5 text-xs text-ink-3 tabular-nums">
                            {formatSpecialPriceRule(s, locale)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
                          <span className="text-lg font-bold text-pine">
                            +฿{s.surcharge.toLocaleString()}
                          </span>
                          <span className="text-xs text-ink-3">{tc("perNight")}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Seasonal rates */}
              {(seasonsByRoom[calendarRoom.id] || []).length > 0 && (
                <div className="mt-5 border-t border-dashed border-line-strong pt-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-pine" strokeWidth={2.5} />
                    <span className="text-xs font-semibold text-ink-3">
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
                            <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                            <div className="mt-0.5 text-xs text-ink-3 tabular-nums">
                              {fmtDateStr(s.start_date, "d MMM", locale)} – {fmtDateStr(s.end_date, "d MMM yyyy", locale)}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
                            <span className="text-lg font-bold text-pine">
                              ฿{s.price_per_night.toLocaleString()}
                            </span>
                            <span className="text-xs text-ink-3">{tc("perNight")}</span>
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
