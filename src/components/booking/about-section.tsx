"use client";

import { useState, useRef, useEffect } from "react";
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

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { HTMLContent } from "@/components/ui/html-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

const VISIBLE_ITEMS = 4;

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
  const [descModal, setDescModal] = useState(false);
  const [amenitiesModal, setAmenitiesModal] = useState(false);
  const [rulesModal, setRulesModal] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const [descOverflows, setDescOverflows] = useState(false);

  useEffect(() => {
    const el = descRef.current;
    if (el) {
      setDescOverflows(el.scrollHeight > el.clientHeight);
    }
  }, [description]);

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Description */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="md:col-span-2"
          >
            <div className="overflow-hidden pt-2 -mt-2">
              <motion.h2
                initial={{ y: "100%" }}
                whileInView={{ y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                className="text-2xl md:text-3xl font-serif text-earth-900 tracking-tight"
              >
                {t("title")}
              </motion.h2>
            </div>

            {/* Description card with accent bar */}
            <div className="relative mt-3 px-3 flex gap-0 overflow-hidden rounded-xl">
              <div ref={descRef} className="line-clamp-6 sm:line-clamp-10">
                <HTMLContent content={description} className="py-4 leading-relaxed text-earth-600" />
              </div>
              {descOverflows && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/80 to-transparent" />
              )}
            </div>
            {descOverflows && (
              <button
                type="button"
                className="mt-2 px-3 text-sm font-medium text-earth-900 underline underline-offset-4 hover:text-earth-600"
                onClick={() => setDescModal(true)}
              >
                {t("readMore")}
              </button>
            )}
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
              <h3 className="text-lg font-serif text-earth-800">{t("amenities")}</h3>
              <div className="mt-3 space-y-2">
                {amenities.slice(0, VISIBLE_ITEMS).map((amenity) => (
                  <div
                    key={amenity}
                    className="flex items-center gap-2 text-sm text-earth-700"
                  >
                    <Check className="h-4 w-4 shrink-0 text-brand" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
              {amenities.length > VISIBLE_ITEMS && (
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-earth-900 underline underline-offset-4 hover:text-earth-600"
                  onClick={() => setAmenitiesModal(true)}
                >
                  {t("readMore")}
                </button>
              )}
            </div>

            {prohibitions.length > 0 && (
              <div>
                <h3 className="text-lg font-serif text-earth-800">{t("rules")}</h3>
                <div className="mt-3 space-y-2">
                  {prohibitions.slice(0, VISIBLE_ITEMS).map((rule) => (
                    <div
                      key={rule}
                      className="flex items-center gap-2 text-sm text-earth-700"
                    >
                      <Check className="h-4 w-4 shrink-0 text-brand" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
                {prohibitions.length > VISIBLE_ITEMS && (
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-earth-900 underline underline-offset-4 hover:text-earth-600"
                    onClick={() => setRulesModal(true)}
                  >
                    {t("readMore")}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>

      </div>

      {/* Description Modal */}
      <Dialog open={descModal} onOpenChange={setDescModal}>
        <DialogContent className="sm:max-w-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("title")}</DialogDescription>
          </DialogHeader>
          <HTMLContent content={description} className="leading-relaxed text-earth-600" />
        </DialogContent>
      </Dialog>

      {/* Amenities Modal */}
      <Dialog open={amenitiesModal} onOpenChange={setAmenitiesModal}>
        <DialogContent className="sm:max-w-md overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("amenities")}</DialogTitle>
            <DialogDescription className="sr-only">{t("amenities")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {amenities.map((amenity) => (
              <div
                key={amenity}
                className="flex items-center gap-2 text-sm text-earth-700"
              >
                <Check className="h-4 w-4 shrink-0 text-brand" />
                <span>{amenity}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* House Rules Modal */}
      <Dialog open={rulesModal} onOpenChange={setRulesModal}>
        <DialogContent className="sm:max-w-md overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("rules")}</DialogTitle>
            <DialogDescription className="sr-only">{t("rules")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {prohibitions.map((rule) => (
              <div
                key={rule}
                className="flex items-center gap-2 text-sm text-earth-700"
              >
                <Check className="h-4 w-4 shrink-0 text-brand" />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
