import { useMemo } from "react";
import Image from "next/image";
import type { Room, RoomSeasonalPrice } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BedDouble } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import { getPriceRange } from "@/lib/calculate-price";

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

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Card
              key={room.id}
              className="group overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
            >
              {room.images[0] && (
                <div className="relative aspect-[16/10] overflow-hidden">
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
                  <p className="mt-2 text-sm leading-relaxed text-gray-500 line-clamp-2">
                    {room.description}
                  </p>
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
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
