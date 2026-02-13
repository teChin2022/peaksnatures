import type { Room } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";

interface RoomsSectionProps {
  rooms: Room[];
}

export function RoomsSection({ rooms }: RoomsSectionProps) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  if (!rooms.length) return null;

  return (
    <section className="py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("subtitle")}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Card key={room.id} className="overflow-hidden border">
              {room.images[0] && (
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={room.images[0]}
                    alt={room.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-gray-900">{room.name}</h3>
                  <Badge variant="secondary" className="shrink-0">
                    ฿{room.price_per_night.toLocaleString()}{tc("perNight")}
                  </Badge>
                </div>
                {room.description && (
                  <p className="mt-1.5 text-sm text-gray-500">
                    {room.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {tc("guests")} {room.max_guests}
                  </span>
                  <span>{t("available", { count: room.quantity })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator className="mt-8" />
      </div>
    </section>
  );
}
