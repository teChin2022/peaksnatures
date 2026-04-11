"use client";

import { motion } from "motion/react";
import { CalendarDays, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function FinalCtaSection() {
  const t = useTranslations("finalCta");

  const scrollToRooms = () => {
    document
      .getElementById("rooms-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="hidden md:block py-24 md:py-32 bg-earth-50">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-earth-200">
            <CalendarDays className="h-5 w-5 text-brand" />
          </div>
          <h2 className="text-3xl md:text-4xl font-serif text-earth-900 tracking-tight">
            {t("title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-earth-600 max-w-xl mx-auto">
            {t("subtitle")}
          </p>
          <Button
            type="button"
            onClick={scrollToRooms}
            className="mt-8 h-12 rounded-full bg-brand px-8 text-base text-white shadow-md hover:bg-brand/90"
          >
            {t("button")}
            <ArrowUp className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
