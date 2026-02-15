import {
  Wifi,
  Car,
  UtensilsCrossed,
  Mountain,
  TreePine,
  Waves,
  Binoculars,
  Flame,
  BookOpen,
  Telescope,
  Fish,
  Users,
  MapPin,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WiFi: Wifi,
  Parking: Car,
  Kitchen: UtensilsCrossed,
  "Mountain View": Mountain,
  Garden: TreePine,
  BBQ: Flame,
  "Hiking Trails": Mountain,
  "Waterfall Nearby": Waves,
  "River View": Waves,
  Kayaking: Waves,
  Fishing: Fish,
  Restaurant: UtensilsCrossed,
  Swimming: Waves,
  "Forest View": TreePine,
  "Bird Watching": Binoculars,
  "National Park Access": TreePine,
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
  themeColor = "#16a34a",
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

            {/* Info chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: themeColor + "15", color: themeColor }}
              >
                <Users className="h-3.5 w-3.5" />
                {t("upToGuests", { count: maxGuests })}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: themeColor + "15", color: themeColor }}
              >
                <MapPin className="h-3.5 w-3.5" />
                {location}
              </span>
            </div>

            {/* Description card with accent bar */}
            <div className="mt-4 flex gap-0 overflow-hidden rounded-xl border bg-gray-50/70">
              <div className="w-1 shrink-0 rounded-l-xl" style={{ backgroundColor: themeColor }} />
              <p className="px-5 py-4 leading-relaxed text-gray-600">{description}</p>
            </div>
          </div>

          {/* Amenities */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("amenities")}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {amenities.map((amenity) => {
                const Icon = AMENITY_ICONS[amenity] || TreePine;
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
