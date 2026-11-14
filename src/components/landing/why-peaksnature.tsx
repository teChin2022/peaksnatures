"use client";

import { useTranslations } from "next-intl";
import { CalendarCheck, Star, Wallet } from "lucide-react";
import { FeatureList } from "./feature-list";

/** Why book here: only mechanisms true for every host (owner-approved copy, 2026-11-13). */
export function WhyPeaksnature() {
  const t = useTranslations("home.why");
  const features = [
    { icon: <Wallet className="text-brand" size={22} aria-hidden="true" />, title: t("payTitle"), description: t("payDesc") },
    { icon: <CalendarCheck className="text-brand" size={22} aria-hidden="true" />, title: t("priceTitle"), description: t("priceDesc") },
    { icon: <Star className="text-brand" size={22} aria-hidden="true" />, title: t("reviewsTitle"), description: t("reviewsDesc") },
  ];

  return (
    <section id="why-peaksnature" className="scroll-mt-20 py-14 md:py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-5 gap-12 lg:gap-20 items-start">
          <div className="lg:col-span-2 lg:sticky lg:top-32">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-earth-900 mb-6 leading-tight">
              {t("title1")}
              {/* nowrap: at lg the column breaks "เจ้าของ|ที่พัก" mid-phrase otherwise. */}
              <span className="text-brand whitespace-nowrap">{t("title2")}</span>
            </h2>
            <p className="text-earth-600 leading-[1.8] text-base text-pretty">{t("intro")}</p>
          </div>

          <div className="lg:col-span-3">
            <FeatureList items={features} />
          </div>
        </div>
      </div>
    </section>
  );
}
