"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  User,
  Home,
  Palette,
  BedDouble,
  CalendarCheck,
  ExternalLink,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useThemeColor } from "@/components/dashboard/theme-context";

export default function GuidePage() {
  const t = useTranslations("dashboardGuide");
  const themeColor = useThemeColor();

  const steps = [
    {
      num: 1,
      icon: User,
      titleKey: "step1Title",
      descKey: "step1Desc",
      items: ["step1Item1", "step1Item2", "step1Item3", "step1Item4"],
      href: "/dashboard/profile",
      linkKey: "step1Link",
    },
    {
      num: 2,
      icon: Home,
      titleKey: "step2Title",
      descKey: "step2Desc",
      items: ["step2Item1", "step2Item2", "step2Item3", "step2Item4", "step2Item5"],
      href: "/dashboard/homestay",
      linkKey: "step2Link",
    },
    {
      num: 3,
      icon: Palette,
      titleKey: "step3Title",
      descKey: "step3Desc",
      items: ["step3Item1", "step3Item2"],
      href: "/dashboard/theme",
      linkKey: "step3Link",
    },
    {
      num: 4,
      icon: BedDouble,
      titleKey: "step4Title",
      descKey: "step4Desc",
      items: ["step4Item1", "step4Item2", "step4Item3"],
      href: "/dashboard/rooms",
      linkKey: "step4Link",
    },
    {
      num: 5,
      icon: CalendarCheck,
      titleKey: "step5Title",
      descKey: "step5Desc",
      items: ["step5Item1", "step5Item2"],
      href: "/dashboard/calendar",
      linkKey: "step5Link",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: themeColor + "15" }}
        >
          <BookOpen className="h-5 w-5" style={{ color: themeColor }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Card key={step.num} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-start gap-4 p-5">
                  {/* Step number */}
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: themeColor }}
                  >
                    {step.num}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: themeColor }}
                      />
                      <h2 className="font-semibold text-gray-900">
                        {t(step.titleKey)}
                      </h2>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                      {t(step.descKey)}
                    </p>
                    <ul className="space-y-1.5 mb-4">
                      {step.items.map((itemKey) => (
                        <li
                          key={itemKey}
                          className="flex items-start gap-2 text-sm text-gray-600"
                        >
                          <CheckCircle2
                            className="h-4 w-4 shrink-0 mt-0.5"
                            style={{ color: themeColor }}
                          />
                          <span>{t(itemKey)}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href={step.href}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        style={{
                          borderColor: themeColor + "40",
                          color: themeColor,
                        }}
                      >
                        {t(step.linkKey)}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Verify section */}
      <Card
        className="border-2"
        style={{ borderColor: themeColor + "30" }}
      >
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5" style={{ color: themeColor }} />
            <h2 className="font-semibold text-gray-900">{t("verifyTitle")}</h2>
          </div>
          <ul className="space-y-1.5">
            <li className="text-sm text-gray-600">• {t("verifyItem1")}</li>
            <li className="text-sm text-gray-600">• {t("verifyItem2")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
