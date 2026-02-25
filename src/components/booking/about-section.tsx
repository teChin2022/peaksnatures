import {
  Wifi,
  Car,
  UtensilsCrossed,
  TreePine,
  Waves,
  Flame,
  BookOpen,
  Telescope,
  Fish,
  Check
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WiFi: Wifi,
  Parking: Car,
  Kitchen: UtensilsCrossed,
  Garden: TreePine,
  BBQ: Flame,
  Kayaking: Waves,
  Fishing: Fish,
  Restaurant: UtensilsCrossed,
  Swimming: Waves,
  Telescope: Telescope,
  Fireplace: Flame,
  Library: BookOpen,
};

interface AboutSectionProps {
  description: string;
  amenities: string[];
  maxGuests: number;
  location: string;
  themeColor?: string;
}

export function AboutSection({
  description,
  amenities,
  maxGuests,
  location,
  themeColor = "#dee1dfff",
}: AboutSectionProps) {
  const t = useTranslations("about");
  return (
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Description */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900">
              {t("title")}
            </h2>

            {/* Description card with accent bar */}
            <div className="mt-3 px-3 flex gap-0 overflow-hidden border rounded-xl">
              <p className="py-4 leading-relaxed text-gray-600">{description}</p>
            </div>
          </div>

          {/* Amenities */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("amenities")}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {amenities.map((amenity) => {
                const Icon = AMENITY_ICONS[amenity] || Check;
                return (
                  <div
                    key={amenity}
                    className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-gray-300"
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: themeColor }} />
                    <span className="truncate">{amenity}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
