"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useIsMobile } from "@/lib/use-is-mobile";
import Image from "next/image";
import { format, eachDayOfInterval, parseISO, subDays } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import type { Room, RoomSeasonalPrice, BlockedDate } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BedDouble, CalendarDays, CalendarSearch, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { getPriceRange } from "@/lib/calculate-price";
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

function RoomCardImage({ src, name, eager, onClick }: { src: string; name: string; eager?: boolean; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <div
      className="relative aspect-[16/10] cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <Image
        ref={imgRef}
        src={src}
        alt={name}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        loading={eager ? "eager" : "lazy"}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className={`h-full w-full object-cover group-hover:scale-105 ${
          loaded ? "opacity-100 transition-transform duration-500" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
        <h3 className="text-base font-semibold text-white drop-shadow-sm">{name}</h3>
      </div>
    </div>
  );
}

function RoomLightbox({ images, name, startIndex, onClose }: { images: string[]; name: string; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
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
        onClick={() => setIndex(index > 0 ? index - 1 : images.length - 1)}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <Image
        key={images[index]}
        src={images[index]}
        alt={`${name} photo ${index + 1}`}
        width={1200}
        height={800}
        priority
        className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
      />

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
        onClick={() => setIndex(index < images.length - 1 ? index + 1 : 0)}
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

interface RoomsSectionProps {
  rooms: Room[];
  themeColor?: string;
  seasonalPrices?: RoomSeasonalPrice[];
  bookedRanges?: BookedRange[];
  blockedDates?: BlockedDate[];
}

export function RoomsSection({ rooms, themeColor = "#16a34a", seasonalPrices = [], bookedRanges = [], blockedDates = [] }: RoomsSectionProps) {
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
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <BedDouble className="h-5 w-5" style={{ color: themeColor }} />
          <h2 className="text-xl font-semibold text-gray-900">
            {t("title")}
          </h2>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {t("subtitle")}
        </p>

        <RoomCards rooms={rooms} themeColor={themeColor} seasonsByRoom={seasonsByRoom} bookedRanges={bookedRanges} blockedDates={blockedDates} />

        <Separator className="mt-10" />
      </div>
    </section>
  );
}

// useIsMobile moved to @/lib/use-is-mobile

function getFullyBookedDates(roomId: string, rooms: Room[], bookedRanges: BookedRange[]) {
  const roomObj = rooms.find((r) => r.id === roomId);
  const qty = roomObj?.quantity || 1;
  const dateCountMap = new Map<string, number>();
  bookedRanges
    .filter((b) => b.room_id === roomId)
    .forEach((b) => {
      try {
        const start = parseISO(b.check_in);
        const end = subDays(parseISO(b.check_out), 1);
        if (end < start) return;
        const days = eachDayOfInterval({ start, end });
        days.forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          dateCountMap.set(key, (dateCountMap.get(key) || 0) + 1);
        });
      } catch {
        // Skip malformed dates
      }
    });
  const fullyBooked = new Set<string>();
  dateCountMap.forEach((count, date) => {
    if (count >= qty) fullyBooked.add(date);
  });
  return fullyBooked;
}

function RoomCards({ rooms, themeColor, seasonsByRoom, bookedRanges, blockedDates }: { rooms: Room[]; themeColor: string; seasonsByRoom: Record<string, RoomSeasonalPrice[]>; bookedRanges: BookedRange[]; blockedDates: BlockedDate[] }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const [lightbox, setLightbox] = useState<{ images: string[]; name: string } | null>(null);
  const [calendarRoomId, setCalendarRoomId] = useState<string | null>(null);
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
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room, index) => (
          <Card
            key={room.id}
            className="group overflow-hidden border py-0 gap-0 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
          >
            {room.images[0] && (
              <RoomCardImage
                src={room.images[0]}
                name={room.name}
                eager={index === 0}
                onClick={() => setLightbox({ images: room.images, name: room.name })}
              />
            )}
            <CardContent className="p-4">
              {(() => {
                const roomSeasons = seasonsByRoom[room.id] || [];
                const { min, max } = getPriceRange(room.price_per_night, roomSeasons);
                const hasRange = min !== max;
                return (
                  <div className="flex items-center gap-1" style={{ borderLeftColor: themeColor }}>
                    {hasRange ? (
                      <>
                        <span className="text-xs text-gray-400 self-end mb-1">{t("fromPrice")}</span>
                        <span className="text-2xl font-bold" style={{ color: themeColor }}>
                          ฿{min.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <span className="text-2xl font-bold" style={{ color: themeColor }}>
                        ฿{room.price_per_night.toLocaleString()}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 self-end mb-1">{tc("perNight")}</span>
                  </div>
                );
              })()}
              {room.description && (
                <HTMLContent content={room.description} className="mt-2 text-sm leading-relaxed text-gray-500 line-clamp-2" />
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                  <Users className="h-3.5 w-3.5" />
                  {tc("guests")} {room.max_guests}
                </span>
                <Badge
                  variant="secondary"
                  className="text-xs font-normal"
                  style={{ backgroundColor: themeColor + "12", color: themeColor }}
                >
                  {t("available", { count: room.quantity })}
                </Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 rounded-full text-white hover:brightness-90"
                  style={{ backgroundColor: themeColor }}
                  onClick={() => {
                    document.dispatchEvent(
                      new CustomEvent("book-room", { detail: { roomId: room.id } })
                    );
                  }}
                >
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  {t("bookRoom")}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0 rounded-full"
                  style={{ borderColor: themeColor, color: themeColor }}
                  onClick={() => setCalendarRoomId(room.id)}
                  title={t("viewCalendar")}
                >
                  <CalendarSearch className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
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
            numberOfMonths={isMobile ? 1 : 2}
            locale={locale === "th" ? thLocale : undefined}
            formatters={locale === "th" ? {
              formatCaption: (date) => {
                const month = date.toLocaleDateString("th-TH", { month: "long" });
                const beYear = date.getFullYear() + 543;
                return `${month} ${beYear}`;
              },
            } : undefined}
            disabled={[
              { before: new Date() },
              ...disabledDates,
            ]}
            modifiers={{
              booked: disabledDates,
            }}
            modifiersClassNames={{
              booked: "!bg-red-100 !text-red-400 !opacity-100",
            }}
            className="rounded-md border w-full"
          />
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-100 border border-red-200" />
              {t("legendBooked")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-white border border-gray-200" />
              {t("legendAvailable")}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
