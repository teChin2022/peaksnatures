// Single source of truth for the canonical/runtime URL.
// Read NEXT_PUBLIC_APP_URL first (the var actually set across .env.local and Vercel),
// fall back to NEXT_PUBLIC_SITE_URL for back-compat, then to the production domain.
const RAW_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://peaksnature.com";
export const SITE_URL = RAW_SITE_URL.replace(/\/$/, "");

export const SITE_NAME = "Peaksnature";
export const SITE_TITLE_DEFAULT = "Peaksnature — Nature Homestay Booking in Thailand";
export const SITE_DESCRIPTION =
  "Discover and book unique nature homestays across Thailand — mountain retreats, riverside escapes, and forest hideaways. Verified hosts, real reviews, instant confirmation.";

export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE_NAME,
};

export const SUPPORTED_LOCALES = ["en", "th"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "th";

export const LOCALE_OG_TAGS: Record<SupportedLocale, string> = {
  th: "th_TH",
  en: "en_US",
};

function joinUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${SITE_URL}${path}`;
}

export function absoluteUrl(path: string): string {
  return joinUrl(path);
}

export function buildAlternates(path: string) {
  const canonical = joinUrl(path);
  return {
    canonical,
    languages: {
      en: canonical,
      th: canonical,
      "x-default": canonical,
    },
  };
}
