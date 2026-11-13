import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import th from "../../messages/th.json";
import en from "../../messages/en.json";

/** Wraps a component in next-intl with the real message files, so tests read the copy guests see. */
export function withIntl(children: ReactNode, locale: "th" | "en" = "th") {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "th" ? th : en} timeZone="Asia/Bangkok">
      {children}
    </NextIntlClientProvider>
  );
}
