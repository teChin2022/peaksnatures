import { format, eachDayOfInterval, parseISO, subDays, isAfter } from "date-fns";

interface BookedRange {
  room_id: string | null;
  check_in: string;
  check_out: string;
}

/**
 * Date strings (yyyy-MM-dd) for the nights a `[from, to)` stay occupies — the
 * check-in night through the night before check-out. Empty when `to <= from`,
 * so a half-picked range (react-day-picker sets from===to on the first tap)
 * occupies nothing.
 */
export function getStayNightKeys(from: Date, to: Date): string[] {
  const lastNight = subDays(to, 1);
  if (lastNight < from) return [];
  return eachDayOfInterval({ start: from, end: lastNight }).map((d) => format(d, "yyyy-MM-dd"));
}

/**
 * The first night a `[from, to)` stay would occupy that cannot be slept in, or
 * null when every night is free. Doubles as the guard for a picked range and as
 * the date named in the "a stay can't run across it" message.
 */
export function firstUnavailableNight(
  unavailableNights: Set<string>,
  from: Date,
  to: Date,
): string | null {
  return getStayNightKeys(from, to).find((key) => unavailableNights.has(key)) ?? null;
}

/**
 * Builds the `disabled` matcher for a react-day-picker stay picker.
 *
 * A free night is always selectable — it can open or close a stay. An
 * unavailable night is selectable only as the CHECK-OUT of the stay in
 * progress: guests leave in the morning, before the next guest arrives, so the
 * night itself is never used. That needs a pending check-in, a date after it,
 * and every night in between free.
 *
 * Pass `pendingCheckIn: null` once the range is complete — nothing is offered
 * as a check-out then, because the guest is starting a fresh stay.
 */
export function makeStayDisabledMatcher(
  unavailableNights: Set<string>,
  pendingCheckIn: Date | null,
): (date: Date) => boolean {
  return (date: Date) => {
    if (!unavailableNights.has(format(date, "yyyy-MM-dd"))) return false;
    if (!pendingCheckIn || !isAfter(date, pendingCheckIn)) return true;
    return firstUnavailableNight(unavailableNights, pendingCheckIn, date) !== null;
  };
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

export type DayAvailability = "available" | "partial" | "full";

/** Per-room availability on a single date, for the calendar's day-detail modal. */
export interface RoomDayStatus {
  roomId: string;
  /** Total units of this room (its `quantity`). */
  total: number;
  /** Units taken by guest bookings. */
  booked: number;
  /** Units still bookable (0 when blocked). */
  free: number;
  /** Host-closed that day (room-specific or homestay-wide block). */
  blocked: boolean;
}

export interface AvailabilityLookup {
  /** Aggregate status across all rooms, for coloring a calendar day. */
  getStatus: (dateKey: string) => DayAvailability;
  /** Per-room breakdown for a date, in room order. */
  getBreakdown: (dateKey: string) => RoomDayStatus[];
}

interface RoomLike {
  id: string;
  quantity: number | null;
  is_active?: boolean;
}

interface BlockedLike {
  room_id: string | null;
  date: string;
}

/**
 * Builds a per-date availability lookup across ALL rooms, for the read-only
 * availability calendar. A date is:
 *   - "full"      → every room-unit is booked or blocked (or the whole homestay
 *                   is blocked that day)
 *   - "available" → no unit is booked or blocked
 *   - "partial"   → some units taken, at least one still free
 *
 * Booking with check_in=12, check_out=14 occupies nights 12 & 13 (not 14),
 * matching {@link getFullyBookedForRoom}. Blocked dates count as occupied so the
 * calendar reflects true bookability, not just guest bookings.
 */
export function buildAvailabilityLookup(
  rooms: RoomLike[],
  bookedRanges: BookedRange[],
  blockedDates: BlockedLike[],
): AvailabilityLookup {
  const totalUnits = rooms.reduce((sum, r) => sum + (r.quantity || 1), 0);

  // dateKey -> (roomId -> units booked that night)
  const bookedByDate = new Map<string, Map<string, number>>();
  for (const b of bookedRanges) {
    if (!b.room_id) continue;
    try {
      const start = parseISO(b.check_in);
      const end = subDays(parseISO(b.check_out), 1);
      if (end < start) continue;
      for (const d of eachDayOfInterval({ start, end })) {
        const key = format(d, "yyyy-MM-dd");
        let perRoom = bookedByDate.get(key);
        if (!perRoom) {
          perRoom = new Map();
          bookedByDate.set(key, perRoom);
        }
        perRoom.set(b.room_id, (perRoom.get(b.room_id) || 0) + 1);
      }
    } catch {
      // Skip malformed dates
    }
  }

  const homestayBlocked = new Set<string>();
  const roomBlockedByDate = new Map<string, Set<string>>();
  for (const bd of blockedDates) {
    if (bd.room_id === null) {
      homestayBlocked.add(bd.date);
    } else {
      let set = roomBlockedByDate.get(bd.date);
      if (!set) {
        set = new Set();
        roomBlockedByDate.set(bd.date, set);
      }
      set.add(bd.room_id);
    }
  }

  const getStatus = (dateKey: string): DayAvailability => {
    if (totalUnits === 0) return "available";
    if (homestayBlocked.has(dateKey)) return "full";
    const bookedMap = bookedByDate.get(dateKey);
    const roomBlocked = roomBlockedByDate.get(dateKey);
    let occupied = 0;
    for (const r of rooms) {
      const quantity = r.quantity || 1;
      if (roomBlocked?.has(r.id)) {
        occupied += quantity;
        continue;
      }
      occupied += Math.min(quantity, bookedMap?.get(r.id) || 0);
    }
    if (occupied >= totalUnits) return "full";
    if (occupied <= 0) return "available";
    return "partial";
  };

  const getBreakdown = (dateKey: string): RoomDayStatus[] => {
    const homestayClosed = homestayBlocked.has(dateKey);
    const bookedMap = bookedByDate.get(dateKey);
    const roomBlocked = roomBlockedByDate.get(dateKey);
    return rooms.map((r) => {
      const total = r.quantity || 1;
      const blocked = homestayClosed || (roomBlocked?.has(r.id) ?? false);
      const booked = blocked ? 0 : Math.min(total, bookedMap?.get(r.id) || 0);
      return { roomId: r.id, total, booked, free: blocked ? 0 : total - booked, blocked };
    });
  };

  return { getStatus, getBreakdown };
}
