"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Room, RoomSeasonalPrice } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BedDouble, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getPriceRange } from "@/lib/calculate-price";
import { HTMLContent } from "@/components/ui/html-content";

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
        src={images[index]}
        alt={`${name} photo ${index + 1}`}
        width={1200}
        height={800}
        className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
      />

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

interface RoomsSectionProps {
  rooms: Room[];
  themeColor?: string;
  seasonalPrices?: RoomSeasonalPrice[];
}

export function RoomsSection({ rooms, themeColor = "#16a34a", seasonalPrices = [] }: RoomsSectionProps) {
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

        <RoomCards rooms={rooms} themeColor={themeColor} seasonsByRoom={seasonsByRoom} />

        <Separator className="mt-10" />
      </div>
    </section>
  );
}

function RoomCards({ rooms, themeColor, seasonsByRoom }: { rooms: Room[]; themeColor: string; seasonsByRoom: Record<string, RoomSeasonalPrice[]> }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const [lightbox, setLightbox] = useState<{ images: string[]; name: string } | null>(null);

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <Card
            key={room.id}
            className="group overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
          >
            {room.images[0] && (
              <div
                className="relative aspect-[16/10] cursor-pointer overflow-hidden"
                onClick={() => setLightbox({ images: room.images, name: room.name })}
              >
                <Image
                  src={room.images[0]}
                  alt={room.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                  <h3 className="text-base font-semibold text-white drop-shadow-sm">{room.name}</h3>
                </div>
              </div>
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
              <Button
                size="sm"
                className="mt-3 w-full rounded-full text-white hover:brightness-90"
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
    </>
  );
}
