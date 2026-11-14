"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, CalendarCheck, ShieldCheck } from "lucide-react";
import { FeatureList } from "./feature-list";

export function ForHosts() {
  const t = useTranslations("home.hosts");
  const benefits = [
    { icon: <Users className="text-brand" size={22} aria-hidden="true" />, title: t("reachTitle"), description: t("reachDesc") },
    { icon: <CalendarCheck className="text-brand" size={22} aria-hidden="true" />, title: t("manageTitle"), description: t("manageDesc") },
    { icon: <ShieldCheck className="text-brand" size={22} aria-hidden="true" />, title: t("riskTitle"), description: t("riskDesc") },
  ];

  return (
    <>
      {/* Audience transition */}
      <div className="py-3 bg-earth-50 text-center">
        <span className="text-sm text-earth-600">{t("audience")}</span>
      </div>

      <section className="py-14 md:py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — heading + benefits */}
            <div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-earth-900 mb-4 leading-tight">
                {t("title1")}
                {/* nowrap: at 375 "ของคุณ" otherwise breaks and leaves "คุณ" alone on a line. */}
                <span className="whitespace-nowrap">
                  <span className="text-brand">{t("title2")}</span>
                  {t("title3")}
                </span>
              </h2>
              <p className="text-earth-600 leading-[1.8] text-base mb-10">{t("subtitle")}</p>

              <FeatureList items={benefits} />
            </div>

            {/* Right — CTA card */}
            <div className="text-center border border-earth-200 rounded-2xl p-10 md:p-14 bg-earth-50">
              <h3 className="text-3xl md:text-4xl font-serif text-earth-900 mb-4">
                {t("cardTitle1")}
                <span className="text-brand">{t("cardTitle2")}</span>
              </h3>
              <p className="text-earth-700 leading-relaxed mb-8">{t("cardDesc")}</p>
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-10 py-4 text-sm font-bold text-white transition-colors hover:bg-brand-hover outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                {t("cta")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
