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
import { Badge } from "@/components/ui/badge";
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
}

export function AboutSection({
  description,
  amenities,
  maxGuests,
  location,
}: AboutSectionProps) {
  const t = useTranslations("about");
  return (
    <section className="py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Description */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900">
              {t("title")}
            </h2>
            <p className="mt-3 leading-relaxed text-gray-600">{description}</p>

            <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {t("upToGuests", { count: maxGuests })}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {location}
              </span>
            </div>
          </div>

          {/* Amenities */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("amenities")}</h3>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {amenities.map((amenity) => {
                const Icon = AMENITY_ICONS[amenity] || TreePine;
                return (
                  <div
                    key={amenity}
                    className="flex items-center gap-2.5 text-sm text-gray-600"
                  >
                    <Icon className="h-4 w-4 text-gray-400" />
                    {amenity}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Separator className="mt-8" />
      </div>
    </section>
  );
}
