"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  scrolled: boolean;
}

type Locale = "en" | "th";

const FLAG: Record<Locale, string> = {
  en: "\u{1F1FA}\u{1F1F8}",
  th: "\u{1F1F9}\u{1F1ED}",
};

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function LanguageSwitcherIcon({ scrolled }: Props) {
  const locale = useLocale();
  const t = useTranslations("bookingMenu");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const current: Locale = locale === "en" ? "en" : "th";

  const setLocale = (next: Locale) => {
    if (next === current || isPending) return;
    document.cookie = `locale=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  const buttonClass = `p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer text-lg leading-none ${
    scrolled ? "text-[#111111]" : "text-white"
  } ${isPending ? "opacity-60" : ""}`;

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label={t("languageAria")}
        title={t("languageAria")}
        className={buttonClass}
      >
        <span aria-hidden="true">{FLAG[current]}</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("languageAria")}
          title={t("languageAria")}
          className={buttonClass}
        >
          <span aria-hidden="true">{FLAG[current]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => setLocale("en")}
          className="cursor-pointer flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{FLAG.en}</span>
            {t("english")}
          </span>
          {current === "en" && <Check className="h-4 w-4 opacity-70" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocale("th")}
          className="cursor-pointer flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{FLAG.th}</span>
            {t("thai")}
          </span>
          {current === "th" && <Check className="h-4 w-4 opacity-70" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
