import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

/**
 * First and last day (yyyy-MM-dd) of the month grid around `month`: whole
 * weeks, Sunday first, as the calendar page draws them. The page reads only
 * the bookings that overlap this range instead of every booking ever.
 */
export function calendarGridRange(month: Date): { from: string; to: string } {
  return {
    from: format(startOfWeek(startOfMonth(month)), "yyyy-MM-dd"),
    to: format(endOfWeek(endOfMonth(month)), "yyyy-MM-dd"),
  };
}

/** Sort key for a day's booking bars: arrivals first, departures last (only two fit). */
export function dayOrder(position: "start" | "single" | "middle" | "end"): number {
  return position === "start" || position === "single" ? 0 : position === "middle" ? 1 : 2;
}
