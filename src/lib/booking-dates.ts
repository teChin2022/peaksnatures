import { format, eachDayOfInterval, parseISO, subDays } from "date-fns";

interface BookedRange {
  room_id: string | null;
  check_in: string;
  check_out: string;
}

/**
 * Returns a Set of date strings (yyyy-MM-dd) that are fully booked for a given room.
 * A booking with check_in=12, check_out=14 occupies nights 12 & 13 (not 14).
 */
export function getFullyBookedForRoom(
  roomId: string,
  roomQuantity: number,
  bookedRanges: BookedRange[],
): Set<string> {
  const dateCountMap = new Map<string, number>();
  for (const b of bookedRanges) {
    if (b.room_id !== roomId) continue;
    try {
      const start = parseISO(b.check_in);
      const end = subDays(parseISO(b.check_out), 1);
      if (end < start) continue;
      const days = eachDayOfInterval({ start, end });
      for (const d of days) {
        const key = format(d, "yyyy-MM-dd");
        dateCountMap.set(key, (dateCountMap.get(key) || 0) + 1);
      }
    } catch {
      // Skip malformed dates
    }
  }
  const fullyBooked = new Set<string>();
  dateCountMap.forEach((count, date) => {
    if (count >= roomQuantity) fullyBooked.add(date);
  });
  return fullyBooked;
}
