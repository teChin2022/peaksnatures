"use client";

import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const locale = useLocale();

  const toggleLocale = () => {
    const newLocale = locale === "en" ? "th" : "en";
    document.cookie = `locale=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    window.location.reload();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      className="text-sm font-medium"
    >
      {locale === "th" ? "\u{1F1F9}\u{1F1ED} TH" : "\u{1F1FA}\u{1F1F8} EN"}
    </Button>
  );
}
