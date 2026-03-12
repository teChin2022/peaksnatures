"use client";

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
import { motion } from "motion/react";
import { HTMLContent } from "@/components/ui/html-content";

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
  prohibitions?: string[];
}

export function AboutSection({
  description,
  amenities,
  maxGuests,
  location,
  prohibitions = [],
}: AboutSectionProps) {
  const t = useTranslations("about");
  return (
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Description */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2"
          >
            <h2 className="text-xl font-semibold text-gray-900">
              {t("title")}
            </h2>

            {/* Description card with accent bar */}
            <div className="mt-3 px-3 flex gap-0 overflow-hidden rounded-xl">
              <HTMLContent content={description} className="py-4 leading-relaxed text-gray-600" />
            </div>
          </motion.div>

          {/* Amenities & House Rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="space-y-6"
          >
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t("amenities")}</h3>
              <div className="mt-3 space-y-2">
                {amenities.map((amenity) => (
                  <div
                    key={amenity}
                    className="flex items-center gap-2 text-sm text-gray-700"
                  >
                    <Check className="h-4 w-4 shrink-0 text-gray-500" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
            </div>

            {prohibitions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t("rules")}</h3>
                <div className="mt-3 space-y-2">
                  {prohibitions.map((rule) => (
                    <div
                      key={rule}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <Check className="h-4 w-4 shrink-0 text-gray-500" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
