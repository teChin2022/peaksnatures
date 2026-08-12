import { fmtDateStr } from "@/lib/format-date";
import type { SpecialPriceEntry } from "@/lib/calculate-price";

/** 0=Sunday … 6=Saturday, matching JS Date.getDay(). */
const WEEKDAY_LABELS: Record<string, string[]> = {
  th: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const WEEKEND = [0, 6];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((n) => set.has(n));
}

function weekdayPhrase(weekdays: number[], locale: string): string {
  const th = locale === "th";
  if (weekdays.length === 0) return "";
  if (sameSet(weekdays, EVERY_DAY)) return th ? "ทุกวัน" : "Every day";
  if (sameSet(weekdays, WEEKEND)) return th ? "ทุกวันเสาร์-อาทิตย์" : "Every Sat–Sun";

  const labels = WEEKDAY_LABELS[th ? "th" : "en"];
  // Render Monday-first so the list reads the way a calendar does.
  const names = [...weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => labels[d]);
  return th ? `ทุกวัน${names.join(", ")}` : `Every ${names.join(", ")}`;
}

function windowPhrase(
  startDate: string | null,
  endDate: string | null,
  locale: string,
): string {
  if (!startDate && !endDate) return "";
  const pattern = "d MMM yyyy";
  if (startDate && endDate) {
    return `${fmtDateStr(startDate, pattern, locale)} – ${fmtDateStr(endDate, pattern, locale)}`;
  }
  if (startDate) {
    const from = fmtDateStr(startDate, pattern, locale);
    return locale === "th" ? `ตั้งแต่ ${from}` : `From ${from}`;
  }
  const until = fmtDateStr(endDate as string, pattern, locale);
  return locale === "th" ? `ถึง ${until}` : `Until ${until}`;
}

function datesPhrase(dates: string[], locale: string): string {
  return [...dates]
    .sort()
    .map((d) => fmtDateStr(d, "d MMM yyyy", locale))
    .join(", ");
}

/**
 * Human-readable description of when a special price rule applies — the row
 * label on the booking page's rate list and in the host's rule list.
 *
 * "ทุกวันเสาร์-อาทิตย์", "ทุกวันเสาร์ · 1 พ.ย. 2569 – 30 พ.ย. 2569",
 * "24 ธ.ค. 2569, 25 ธ.ค. 2569".
 */
export function formatSpecialPriceRule(
  rule: Pick<SpecialPriceEntry, "rule_type" | "weekdays" | "dates" | "start_date" | "end_date">,
  locale: string,
): string {
  if (rule.rule_type === "date") return datesPhrase(rule.dates, locale);

  const days = weekdayPhrase(rule.weekdays, locale);
  const window = windowPhrase(rule.start_date, rule.end_date, locale);
  return window ? `${days} · ${window}` : days;
}
