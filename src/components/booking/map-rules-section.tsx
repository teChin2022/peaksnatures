"use client";

import { MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

interface MapRulesSectionProps {
  mapEmbedUrl: string | null;
  location: string;
  prohibitions?: string[];
}

export function MapRulesSection({
  mapEmbedUrl,
  location,
}: MapRulesSectionProps) {
  const t = useTranslations("about");

  if (!mapEmbedUrl) return null;

  return (
    <section className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100"
            >
              <MapPin className="h-4.5 w-4.5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t("location")}
              </h2>
              <p className="text-sm text-gray-500">{location}</p>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <iframe
              src={mapEmbedUrl}
              className="h-80 w-full lg:h-[400px]"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title={t("mapTitle")}
            />
          </div>
        </motion.div>

        <Separator className="mt-10" />
      </div>
    </section>
  );
}
