"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Locale = "en" | "th";

const FLAG: Record<Locale, string> = {
  en: "\u{1F1FA}\u{1F1F8}",
  th: "\u{1F1F9}\u{1F1ED}",
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("bookingMenu");
  const current: Locale = locale === "en" ? "en" : "th";

  const toggleLocale = () => {
    const newLocale = current === "en" ? "th" : "en";
    document.cookie = `locale=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    window.location.reload();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleLocale}
      aria-label={t("languageAria")}
      title={t("languageAria")}
      // size-11 = 44px, the minimum accessible touch target.
      className="size-11 cursor-pointer text-lg leading-none"
    >
      <span aria-hidden="true">{FLAG[current]}</span>
    </Button>
  );
}
