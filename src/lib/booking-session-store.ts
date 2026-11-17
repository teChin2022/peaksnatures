import type { DateRange } from "react-day-picker";

/**
 * The guest's stay and chosen houses, kept in sessionStorage so a refresh does
 * not lose them (this tab only; it dies with the tab). No personal details are
 * stored: name, email and phone are typed again. Everything read back is
 * checked against the page's own catalog, since storage is editable and may be
 * stale; the booking routes still validate whatever is finally sent.
 */
export interface SavedLine {
  lineId: string;
  roomId: string;
  numGuests: number;
  tierIds: string[];
  optionIds: string[];
}

export interface SavedStay {
  dateRange: DateRange;
  lines: SavedLine[];
}

interface CatalogRefs {
  rooms: { id: string; is_active: boolean }[];
  guestPricing: { id: string; room_id: string }[];
  roomOptions: { id: string; room_id: string }[];
}

export const savedStayKey = (homestayId: string) => `pn_stay:${homestayId}`;

/** Drops the kept stay at once, for a guest who chose to leave and clear (the page may unload before any effect runs). */
export function forgetSavedStay(homestayId: string) {
  try {
    sessionStorage.removeItem(savedStayKey(homestayId));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** A local-midnight Date, as the date picker makes them. */
const fromYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Null when there is nothing worth keeping: no full stay. */
export function serializeStay(dateRange: DateRange | undefined, lines: SavedLine[]): string | null {
  if (!dateRange?.from || !dateRange?.to) return null;
  return JSON.stringify({ from: ymd(dateRange.from), to: ymd(dateRange.to), lines });
}

/**
 * Reads a saved stay back. Null when it is missing, malformed, or starts before
 * `todayStr` (Bangkok's YYYY-MM-DD). A line is dropped when its house is gone
 * or closed, or one of its guest groups or add-ons no longer exists.
 */
export function parseSavedStay(raw: string | null, catalog: CatalogRefs, todayStr: string): SavedStay | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { from, to, lines } = data as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string" || !DAY.test(from) || !DAY.test(to)) return null;
  if (from < todayStr || to <= from) return null;

  const active = new Set(catalog.rooms.filter((r) => r.is_active).map((r) => r.id));
  const kept: SavedLine[] = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l !== "object") continue;
    const { lineId, roomId, numGuests, tierIds, optionIds } = l as Record<string, unknown>;
    if (typeof lineId !== "string" || typeof roomId !== "string" || !active.has(roomId)) continue;
    if (typeof numGuests !== "number" || !Number.isInteger(numGuests) || numGuests < 1) continue;
    if (!strings(tierIds) || !strings(optionIds)) continue;
    const tiers = new Set(catalog.guestPricing.filter((g) => g.room_id === roomId).map((g) => g.id));
    const options = new Set(catalog.roomOptions.filter((o) => o.room_id === roomId).map((o) => o.id));
    // A group or add-on the host has since removed would change the price: drop the whole line.
    if (!tierIds.every((id) => tiers.has(id)) || !optionIds.every((id) => options.has(id))) continue;
    kept.push({ lineId, roomId, numGuests, tierIds, optionIds });
  }
  return { dateRange: { from: fromYmd(from), to: fromYmd(to) }, lines: kept };
}
