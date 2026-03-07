"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Room, RoomSeasonalPrice } from "@/types/database";

import { Badge } from "@/components/ui/badge";
import { Users, BedDouble, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getPriceRange } from "@/lib/calculate-price";
import { HTMLContent } from "@/components/ui/html-content";

function RoomImageGallery({ images, name }: { images: string[]; name: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="group relative aspect-[4/3] overflow-hidden rounded-lg"
          >
            <Image
              src={img}
              alt={`${name} photo ${i + 1}`}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 text-white hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 text-white hover:bg-white/20"
            onClick={() =>
              setLightboxIndex(
                lightboxIndex > 0 ? lightboxIndex - 1 : images.length - 1
              )
            }
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <Image
            src={images[lightboxIndex]}
            alt={`${name} photo ${lightboxIndex + 1}`}
            width={1200}
            height={800}
            className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
          />

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 text-white hover:bg-white/20"
            onClick={() =>
              setLightboxIndex(
                lightboxIndex < images.length - 1 ? lightboxIndex + 1 : 0
              )
            }
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div className="absolute bottom-6 text-sm text-white/70">
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
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

        <div className="mt-6 space-y-8">
          {rooms.map((room) => {
            const roomSeasons = seasonsByRoom[room.id] || [];
            const { min, max } = getPriceRange(room.price_per_night, roomSeasons);
            const hasRange = min !== max;
            return (
              <div key={room.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{room.name}</h3>
                    {room.description && (
                      <HTMLContent content={room.description} className="mt-1 text-sm leading-relaxed text-gray-500" />
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
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
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <div className="flex items-center gap-1">
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
                    <Button
                      size="sm"
                      className="rounded-full text-white hover:brightness-90"
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
                  </div>
                </div>
                {room.images.length > 0 && (
                  <div className="mt-4">
                    <RoomImageGallery images={room.images} name={room.name} />
                  </div>
                )}
                {rooms.indexOf(room) < rooms.length - 1 && (
                  <Separator className="mt-8" />
                )}
              </div>
            );
          })}
        </div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
