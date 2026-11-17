"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import Image from "next/image";
import { startOfToday, addMonths, parseISO, isBefore, format, eachDayOfInterval, subDays } from "date-fns";
import type { DayProps } from "react-day-picker";
import { th as thLocale } from "date-fns/locale";
import type { Room, RoomSeasonalPrice, RoomSpecialPrice, BlockedDate } from "@/types/database";

type BookingStep = "dates" | "details" | "payment";
import { Users, CalendarSearch, ChevronLeft, ChevronRight, X, Sparkles, Wrench, Plus } from "lucide-react";
import { roomCtaState } from "@/components/booking/room-cta-state";

import { useTranslations, useLocale } from "next-intl";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBookingCartOptional, type CartLine } from "@/components/booking/booking-cart-context";
import { RoomConfigDialog } from "@/components/booking/room-config-dialog";
import { RoomRateTable } from "@/components/booking/room-rate-table";
import { CartLineList } from "@/components/booking/cart-line-list";
import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";
import { PromoLinkBanner, type PromoLink } from "@/components/booking/promo-link-banner";
import { BOOKED_DAY_MODIFIER, CalendarLegend, LEGEND_SWATCH } from "@/components/booking/calendar-legend";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { freeUnitsForStay, getFullyBookedForRoom } from "@/lib/booking-dates";
import { fmtDate } from "@/lib/format-date";
import { billingTodayStr } from "@/lib/billing-dates";
import { cardPrice, upcomingSeasons } from "@/lib/room-rates";
import { HTMLContent } from "@/components/ui/html-content";
import { thumbScroll } from "@/components/booking/gallery-section";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "radix-ui";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2UyZThmMCIvPjwvc3ZnPg==";


export function RoomLightbox({ images, name, startIndex, onClose }: { images: string[]; name: string; startIndex: number; onClose: () => void }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const tg = useTranslations("gallery");
  const [index, setIndex] = useState(startIndex);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const prevImage = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const nextImage = useCallback(() => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);
  useSwipe(containerEl, { onSwipeLeft: nextImage, onSwipeRight: prevImage });

  // A Radix dialog (B20): Esc closes it, focus stays inside, and it has a name.
  // The primitive Content, not DialogContent, keeps the full-screen look.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogPortal>
    <DialogPrimitive.Content aria-describedby={undefined} ref={setContainerEl} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-2xl p-4 outline-none" style={{ touchAction: "none" }}>
      <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-10 text-white hover:bg-white/20"
        aria-label={tc("close")} onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 z-10 text-white hover:bg-white/20"
        aria-label={t("prevPhoto")} onClick={prevImage}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <div className="flex h-[85vh] w-[90vw] max-w-5xl items-center justify-center">
        <div className="relative flex max-h-[85vh] max-w-full overflow-hidden rounded-2xl">
          <Image
            key={images[index]}
            src={images[index]}
            alt={tg("photoAlt", { name, number: index + 1 })}
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
        aria-label={t("nextPhoto")} onClick={nextImage}
      >
        <ChevronRight className="h-8 w-8" />
      </Button>

      <div className="absolute bottom-6 text-sm text-white/70">
        {index + 1} / {images.length}
      </div>
    </DialogPrimitive.Content>
    </DialogPortal>
    </Dialog>
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
  /** The referral code a ?promo= link brought, if any. */
  promo?: PromoLink | null;
}

export function RoomsSection({ rooms, seasonalPrices = EMPTY_SEASONAL_PRICES, specialPrices = EMPTY_SPECIAL_PRICES, bookedRanges = EMPTY_BOOKED_RANGES, blockedDates = EMPTY_BLOCKED_DATES, popularRoomIds = EMPTY_POPULAR_IDS, promo = null }: RoomsSectionProps) {
  const t = useTranslations("rooms");

  // Seasons that have ended never price a stay again; left in, one could set a card's lowest price.
  const seasonsByRoom = useMemo(() => {
    const map: Record<string, RoomSeasonalPrice[]> = {};
    for (const s of upcomingSeasons(seasonalPrices, billingTodayStr())) {
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
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="overflow-hidden pt-2 -mt-2">
          <motion.h2
            // Checkout's Back lands here (booking-section), so it can take focus.
            id="rooms-heading"
            tabIndex={-1}
            initial={{ y: "100%" }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
            className="scroll-mt-24 text-2xl md:text-3xl font-serif text-ink tracking-tight outline-none"
          >
            {t("title")}
          </motion.h2>
        </div>
        <StayLine />
        {promo && <PromoLinkBanner promo={promo} className="mt-4 max-w-xl" />}

        <RoomCards rooms={rooms} seasonsByRoom={seasonsByRoom} specialsByRoom={specialsByRoom} bookedRanges={bookedRanges} blockedDates={blockedDates} popularRoomIds={popularRoomIds} />

      </div>
    </section>
  );
}

/**
 * Under the houses heading: the stay the houses are priced for, with "change
 * dates" right beside it (the phone bar stops offering the dates once a house
 * is chosen). Before a full stay is picked, the section's usual subtitle.
 */
function StayLine() {
  const t = useTranslations("rooms");
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const cart = useBookingCartOptional();
  const [open, setOpen] = useState(false);
  const from = cart?.dateRange?.from;
  const to = cart?.dateRange?.to;
  const nights = cart?.nights ?? 0;

  if (!from || !to || nights < 1) return <p className="mt-2 text-sm text-ink-3">{t("subtitle")}</p>;
  return (
    <>
      <p className="mt-2 text-sm text-ink-2">
        {fmtDate(from, "EEE d MMM", locale)} – {fmtDate(to, "EEE d MMM", locale)} · {nights} {nights > 1 ? tc("nights") : tc("night")}
        {/* -my-3 keeps the 44px tap target without making the line 44px tall. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-my-3 ml-2 inline-flex min-h-11 items-center rounded-sm font-medium text-pine underline underline-offset-4 hover:text-pine-hover outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
        >
          {tb("changeDates")}
        </button>
      </p>
      <BookingCalendarDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function getFullyBookedDates(roomId: string, rooms: Room[], bookedRanges: BookedRange[]) {
  const roomObj = rooms.find((r) => r.id === roomId);
  return getFullyBookedForRoom(roomId, roomObj?.quantity || 1, bookedRanges);
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

/**
 * One house on /book: a white card with its photos (swipe, arrows, thumbnails,
 * tap for the lightbox) and, below on phones or beside from md, the name,
 * description, facts, price and the actions. The main button's state comes
 * from roomCtaState and stays disabled until both dates are chosen. A chosen
 * house shows its chosen units on the card itself (CartLineList): the page has
 * no cart.
 */
export function SingleRoomHero({
  room,
  seasonalPrices,
  specialPrices,
  onLightbox,
  onCalendar,
  onDesc,
  onAddToCart,
  cartEnabled,
  bookingLocked,
  isPopular,
  unavailableForDates,
  datesChosen,
  remaining = 0,
  inCart = 0,
  stay,
}: {
  room: Room;
  seasonalPrices: RoomSeasonalPrice[];
  specialPrices: RoomSpecialPrice[];
  onLightbox: () => void;
  onCalendar: () => void;
  onDesc: () => void;
  onAddToCart: () => void;
  cartEnabled: boolean;
  bookingLocked: boolean;
  isPopular?: boolean;
  unavailableForDates?: boolean;
  datesChosen?: boolean;
  /** Units still bookable for the chosen dates; only meaningful once dates are chosen. */
  remaining?: number;
  /** Units of this house the guest has chosen for these dates. */
  inCart?: number;
  /** The whole stay's price at the normal rate, once a full stay is chosen. */
  stay?: { total: number; nights: number };
}) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const ta = useTranslations("about");
  const tg = useTranslations("gallery");
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

  const shown = cardPrice(room.price_per_night, seasonalPrices, specialPrices);
  const ctaState = roomCtaState({ datesChosen: !!datesChosen, inCart, remaining });

  if (!room.is_active) {
    const cover = images[0];
    return (
      <div data-room-id={room.id} aria-disabled="true" className="grid overflow-hidden rounded-[20px] bg-white md:grid-cols-[52%_1fr]">
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
      </div>
    );
  }

  const mainLabel = unavailableForDates ? (
    t("unavailableForDates")
  ) : ctaState === "add-more" ? (
    <>
      <Plus className="h-4 w-4" />
      {t("selectAnother")}
    </>
  ) : (
    t("selectThisRoom")
  );
  // Once every free unit is chosen there is nothing left to add: each unit is edited on its line.
  const showMain = cartEnabled && ctaState !== "full";

  return (
    // No entrance: a task surface starts its content visible (DESIGN.md); the cards used to wait at opacity 0.
    <div
      data-room-id={room.id}
      // Chosen: a Pine outline, so the guest sees at a glance which houses are chosen.
      // scroll-mt clears the fixed site header when "see other houses" scrolls a card into view.
      className={`grid scroll-mt-24 overflow-hidden rounded-[20px] bg-white md:grid-cols-[52%_1fr] ${inCart > 0 ? "ring-[1.5px] ring-inset ring-pine" : ""}`}
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
                      alt={tg("photoAlt", { name: room.name, number: i + 1 })}
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
          <button type="button" className="absolute inset-0 z-[1] cursor-pointer" onClick={onLightbox} aria-label={tg("showAll")} />

          {(isPopular || inCart > 0) && (
            <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-wrap gap-1.5">
              {isPopular && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FCEFC7] px-3 py-1 text-xs font-semibold text-[#7A4D00]">
                  <Sparkles className="h-3 w-3" />
                  {t("popular")}
                </span>
              )}
              {inCart > 0 && <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink">{t("chosen")}</span>}
            </div>
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
                // 44px tall: the minimum touch target, same as the availability calendar's house photos.
                className={`relative h-11 w-16 shrink-0 overflow-hidden rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1 ${
                  i === index ? "opacity-100 ring-2 ring-pine md:ring-white" : "opacity-60 hover:opacity-100"
                }`}
              >
                <Image src={src} alt="" fill sizes="64px" className="object-cover" />
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
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
          {stay ? (
            // The stay's price, the same total the house's dialog starts on.
            <p className="whitespace-nowrap">
              <span className="font-serif text-3xl leading-tight text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                ฿{stay.total.toLocaleString()}
              </span>
              <span className="ml-1.5 text-[13px] text-ink-2">{t("stayPriceNights", { count: stay.nights })}</span>
            </p>
          ) : (
            <p className="whitespace-nowrap">
              {shown.from && <span className="mr-1.5 text-[13px] text-ink-2">{t("priceFrom")}</span>}
              {/* Lining figures: the serif's old-style ones read "฿100" as "฿1OO". */}
              <span className="font-serif text-3xl leading-tight text-ink" style={{ fontFeatureSettings: '"lnum", "tnum"' }}>
                ฿{shown.price.toLocaleString()}
              </span>
              <span className="ml-1 text-[13px] text-ink-2">{tc("perNight")}</span>
            </p>
          )}

          {datesChosen && inCart > 0 && <CartLineList roomId={room.id} />}

          <div className={`grid gap-2 ${showMain ? "@md:grid-cols-2" : ""}`}>
            {showMain && (
              <Button
                data-room-main
                disabled={bookingLocked || unavailableForDates || ctaState === "pick-dates"}
                className={`h-auto min-h-12 gap-2 rounded-full px-5 text-[15px] font-medium shadow-none disabled:cursor-not-allowed disabled:opacity-50 @md:order-2 ${
                  ctaState === "add-more"
                    ? "border border-line-strong bg-white text-ink hover:bg-mist"
                    : "border-0 bg-pine text-white hover:bg-pine-hover"
                }`}
                onClick={onAddToCart}
              >
                {mainLabel}
              </Button>
            )}
            {/* Under the button it explains on phones; under both buttons once they sit side by side. */}
            {showMain && ctaState === "pick-dates" && !bookingLocked && (
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
    </div>
  );
}

/**
 * A day of the view-only "วันว่าง & ราคา" calendar: a grid cell with text, not
 * a button. The number sits in a `.day-btn` so the shared day modifiers (today,
 * outside, past, booked) style it like every other calendar's day. Booked
 * nights add the word to the cell's label, since the strike-through is visual.
 */
function StaticDay(props: DayProps) {
  const t = useTranslations("rooms");
  const label = props["aria-label"];
  return (
    <td
      role={props.role}
      className={props.className}
      style={props.style}
      aria-label={props.modifiers.booked && label ? `${label}, ${t("legendBooked")}` : label}
    >
      {/* Same size rule as CalendarDayButton (ui/calendar.tsx). */}
      <span className="day-btn relative flex size-[min(2.75rem,calc((100vw_-_4rem_-_2px)/7))] items-center justify-center rounded-full text-sm font-medium text-earth-700">
        {props.children}
      </span>
    </td>
  );
}

function RoomCards({ rooms, seasonsByRoom, specialsByRoom, bookedRanges, blockedDates, popularRoomIds }: { rooms: Room[]; seasonsByRoom: Record<string, RoomSeasonalPrice[]>; specialsByRoom: Record<string, RoomSpecialPrice[]>; bookedRanges: BookedRange[]; blockedDates: BlockedDate[]; popularRoomIds: ReadonlySet<string> }) {
  const t = useTranslations("rooms");
  const [lightbox, setLightbox] = useState<{ images: string[]; name: string } | null>(null);
  const [calendarRoomId, setCalendarRoomId] = useState<string | null>(null);
  const [descRoomId, setDescRoomId] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>("dates");
  const locale = useLocale();
  const cart = useBookingCartOptional();
  const [config, setConfig] = useState<{ room: Room; editingLine?: CartLine } | null>(null);
  // After the date picker's Done the list starts with one house (see `dates-picked` below).
  // Keyed to the stay it was made for, so other dates, or none, show every house again.
  const [focus, setFocus] = useState<{ stay: string; ids: string[] } | null>(null);

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

  // A full stay (at least one night). A half-picked range (check-in only) counts
  // as no dates: every house shows, and nothing chosen is shown or totalled.
  const from = cart?.dateRange?.from;
  const to = cart?.dateRange?.to;
  const nights = cart?.nights ?? 0;
  const datesChosen = !!from && !!to && nights > 0;
  const stay = datesChosen ? `${format(from, "yyyy-MM-dd")}|${format(to, "yyyy-MM-dd")}` : "";
  const nightKeys = useMemo(
    () => (from && to && nights > 0 ? eachDayOfInterval({ start: from, end: subDays(to, 1) }).map((d) => format(d, "yyyy-MM-dd")) : []),
    [from, to, nights],
  );

  // Once dates are chosen, only show rooms that are actually available for them
  // (hide rooms fully booked or blocked for the selected range).
  const visibleRooms = datesChosen && cart ? rooms.filter((room) => cart.isRoomAvailableForRange(room)) : rooms;
  const focusIds = datesChosen && focus?.stay === stay ? focus.ids : null;
  // Chosen houses always stay in view, so nothing counted on the bar is ever hidden.
  const shownRooms = focusIds ? visibleRooms.filter((r) => focusIds.includes(r.id) || (cart?.countForRoom(r.id) ?? 0) > 0) : visibleRooms;
  const hiddenRooms = focusIds ? visibleRooms.filter((r) => r.is_active && !shownRooms.includes(r)) : [];
  // "From" price of the hidden houses: the cheapest average night for this stay.
  const hiddenFrom =
    from && to && nights > 0 && hiddenRooms.length > 0
      ? Math.round(
          Math.min(
            ...hiddenRooms.map(
              (r) =>
                calculateTotalPrice({ basePricePerNight: r.price_per_night, checkIn: from, checkOut: to, seasons: seasonsByRoom[r.id] || [], specialPrices: specialsByRoom[r.id] || [] }).total / nights,
            ),
          ),
        )
      : 0;

  // Done on a date picker (BookingCalendarPanel sends `dates-picked`): show one house first —
  // the one picked on the availability calendar, else the houses already chosen, else the
  // first free one in the page's order (the popular house leads).
  useEffect(() => {
    if (!cart) return;
    const onPicked = (e: Event) => {
      const roomId = (e as CustomEvent<{ roomId?: string | null }>).detail?.roomId ?? null;
      const free = rooms.filter((r) => r.is_active && cart.isRoomAvailableForRange(r));
      if (!stay || free.length === 0) return setFocus(null);
      const ids = free.filter((r) => r.id === roomId || cart.countForRoom(r.id) > 0).map((r) => r.id);
      setFocus({ stay, ids: ids.length > 0 ? ids : [free[0].id] });
    };
    document.addEventListener("dates-picked", onPicked);
    return () => document.removeEventListener("dates-picked", onPicked);
  }, [cart, rooms, stay]);

  // New dates can leave a chosen house unavailable (or fewer of its units free). Its card is
  // then hidden, so it must not stay counted: drop what no longer fits and say which house.
  // Runs on any full stay, not only on Done: the picker writes each tap, and closing it keeps them.
  useEffect(() => {
    if (!cart || bookingLocked || !datesChosen) return;
    const gone: string[] = [];
    for (const room of rooms) {
      const mine = cart.lines.filter((l) => l.roomId === room.id);
      if (mine.length === 0) continue;
      const free = freeUnitsForStay(room.id, room.quantity || 1, nightKeys, cart.liveBookedRanges, cart.catalog.blockedDates);
      if (mine.length <= free) continue;
      for (const line of mine.slice(free)) cart.removeLine(line.lineId);
      if (free > 0) toast(t("trimmedForDates", { name: room.name, count: free }));
      else gone.push(room.name);
    }
    if (gone.length > 0) toast(t("removedForDates", { names: new Intl.ListFormat(locale, { type: "conjunction" }).format(gone) }));
  }, [cart, bookingLocked, datesChosen, rooms, nightKeys, t, locale]);

  // "See other houses", and "choose another house" in the config dialog: show every house
  // and take the guest to the first one they had not seen.
  const showAllHouses = () => {
    const next = hiddenRooms[0];
    setFocus(null);
    if (!next) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`[data-room-id="${next.id}"]`);
      card?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      card?.querySelector<HTMLElement>("[data-room-main]")?.focus({ preventScroll: true });
    }, 50);
  };

  // The config dialog (here or on the availability calendar) chose a house and closed
  // without giving focus back: reveal the rest if asked, else land on the new line.
  // No deps: it re-subscribes each render, so it always sees the current hidden houses.
  useEffect(() => {
    const onChosen = (e: Event) => {
      const { lineId, more } = (e as CustomEvent<{ lineId: string; more: boolean }>).detail;
      if (more && hiddenRooms.length > 0) return showAllHouses();
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-edit-line="${lineId}"]`)?.focus());
    };
    document.addEventListener("house-chosen", onChosen);
    return () => document.removeEventListener("house-chosen", onChosen);
  });

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
  // Past nights read as past, not booked.
  const bookedDays = useMemo(() => disabledDates.filter((d) => !isBefore(d, startOfToday())), [disabledDates]);

  return (
    <>
      <div className="mt-8 grid gap-5">
        {shownRooms.map((room) => (
          <SingleRoomHero
            key={room.id}
            room={room}
            seasonalPrices={seasonsByRoom[room.id] || []}
            specialPrices={specialsByRoom[room.id] || []}
            onLightbox={() => setLightbox({ images: room.images, name: room.name })}
            onCalendar={() => setCalendarRoomId(room.id)}
            onDesc={() => setDescRoomId(room.id)}
            onAddToCart={() => handleAddToCart(room)}
            cartEnabled={!!cart}
            bookingLocked={bookingLocked}
            isPopular={popularRoomIds.has(room.id)}
            unavailableForDates={false}
            datesChosen={datesChosen}
            remaining={cart?.remainingForRoom(room)}
            inCart={datesChosen ? (cart?.countForRoom(room.id) ?? 0) : 0}
            stay={
              datesChosen && from && to
                ? {
                    total: calculateTotalPrice({ basePricePerNight: room.price_per_night, checkIn: from, checkOut: to, seasons: seasonsByRoom[room.id] || [], specialPrices: specialsByRoom[room.id] || [] }).total,
                    nights,
                  }
                : undefined
            }
          />
        ))}
        {datesChosen && visibleRooms.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-mist p-8 text-center text-sm text-ink-2">
            {t("noAvailableRooms")}
          </div>
        )}
        {focusIds && hiddenRooms.length > 0 && (
          <div className="text-center">
            <button
              type="button"
              onClick={showAllHouses}
              disabled={bookingLocked}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-mist outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 disabled:opacity-50 md:w-auto md:min-w-80"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {(cart?.lines.length ?? 0) > 0 ? t("bookMoreHouses") : t("showOtherHouses")}
            </button>
            <p className="mt-2 text-sm text-ink-2">{t("moreHousesHint", { count: hiddenRooms.length, price: hiddenFrom.toLocaleString() })}</p>
          </div>
        )}
        {focusIds && hiddenRooms.length === 0 && visibleRooms.length > 0 && (
          <p className="text-center text-sm text-ink-2">{t("noOtherHouses")}</p>
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
        <DialogContent className="sm:max-w-2xl overflow-y-auto max-h-[90vh] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("availabilityTitle")}</DialogTitle>
            <DialogDescription>
              {calendarRoom?.name}
            </DialogDescription>
          </DialogHeader>
          {/* View only (owner, 2026-11-14): no `mode`, so the days are text, not
              buttons — dates are picked from the date bars, not from a house. */}
          <Calendar
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
            disabled={{ before: startOfToday() }}
            modifiers={{ booked: bookedDays }}
            modifiersClassNames={{ booked: BOOKED_DAY_MODIFIER }}
            components={{ Day: StaticDay }}
            // Same phone fit as the date picker: seven 44px days in a p-4 dialog.
            className="w-full p-0 sm:p-4"
          />
          <CalendarLegend
            items={[
              { swatch: LEGEND_SWATCH.free, label: t("legendAvailable") },
              { swatch: LEGEND_SWATCH.full, label: t("legendBooked") },
            ]}
          />

          {calendarRoom && (
            <RoomRateTable room={calendarRoom} seasonalPrices={seasonsByRoom[calendarRoom.id] || []} specialPrices={specialsByRoom[calendarRoom.id] || []} className="mt-5" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
