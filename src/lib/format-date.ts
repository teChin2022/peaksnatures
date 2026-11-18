import { format, parseISO } from "date-fns";
import { th as thLocale } from "date-fns/locale";

/**
 * Format a Date with locale support.
 * Thai locale uses Buddhist Era year (CE + 543).
 */
export function fmtDate(d: Date, pattern: string, locale: string): string {
  const opts = locale === "th" ? { locale: thLocale } : undefined;
  const formatted = format(d, pattern, opts);
  if (locale === "th") {
    const ceYear = d.getFullYear();
    const beYear = ceYear + 543;
    return formatted.replace(String(ceYear), String(beYear));
  }
  return formatted;
}

/**
 * Parse an ISO date string and format it with locale support.
 * Convenience wrapper around fmtDate for raw date strings like "2026-02-15".
 */
export function fmtDateStr(dateStr: string, pattern: string, locale: string): string {
  return fmtDate(parseISO(dateStr), pattern, locale);
}

const BANGKOK_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * A timestamp as Bangkok wall time, for server-rendered pages: the server runs
 * in UTC on Vercel, so fmtDate (process time zone) would be 7 hours early.
 */
export function fmtBangkokTime(iso: string): string {
  return BANGKOK_TIME.format(new Date(iso));
}
