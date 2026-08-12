"use client";

import { createContext, useContext, useReducer, useMemo, useCallback, useEffect, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import { format, subDays, eachDayOfInterval } from "date-fns";
import type { Room, RoomSeasonalPrice, RoomSpecialPrice, RoomOption, RoomGuestPricing, BlockedDate } from "@/types/database";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { computeCompositionSurcharge } from "@/lib/guest-pricing";
import { getFullyBookedForRoom } from "@/lib/booking-dates";

/**
 * One room added to the cart. Dates are shared across the whole cart (stored on
 * the context, not per line), so a line only carries the room + its per-room
 * guest/tier/option choices. `lineId` lets the same room appear more than once.
 */
export interface CartLine {
  lineId: string;
  roomId: string;
  numGuests: number;
  /** Ticked guest-composition tiers. At most one in base-tier mode; may stack otherwise. */
  tierIds: string[];
  optionIds: string[];
}

export interface BookedRange {
  room_id: string | null;
  check_in: string;
  check_out: string;
}

/** Server-fetched catalog the cart needs to price + check availability anywhere. */
export interface BookingCatalog {
  rooms: Room[];
  seasonalPrices: RoomSeasonalPrice[];
  specialPrices: RoomSpecialPrice[];
  roomOptions: RoomOption[];
  guestPricing: RoomGuestPricing[];
  blockedDates: BlockedDate[];
  bookedRanges: BookedRange[];
}

interface CartState {
  dateRange?: DateRange;
  lines: CartLine[];
}

type CartAction =
  | { type: "SET_DATES"; dateRange?: DateRange }
  | { type: "ADD_LINE"; line: CartLine }
  | { type: "REMOVE_LINE"; lineId: string }
  | { type: "UPDATE_LINE"; lineId: string; patch: Partial<Omit<CartLine, "lineId">> }
  | { type: "CLEAR" };

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "SET_DATES":
      return { ...state, dateRange: action.dateRange };
    case "ADD_LINE":
      return { ...state, lines: [...state.lines, action.line] };
    case "REMOVE_LINE":
      return { ...state, lines: state.lines.filter((l) => l.lineId !== action.lineId) };
    case "UPDATE_LINE":
      return {
        ...state,
        lines: state.lines.map((l) => (l.lineId === action.lineId ? { ...l, ...action.patch } : l)),
      };
    case "CLEAR":
      return { dateRange: state.dateRange, lines: [] };
    default:
      return state;
  }
}

export interface BookingCartValue {
  dateRange?: DateRange;
  lines: CartLine[];
  nights: number;
  liveBookedRanges: BookedRange[];
  setLiveBookedRanges: (ranges: BookedRange[]) => void;
  setDates: (dateRange?: DateRange) => void;
  addLine: (line: CartLine) => void;
  removeLine: (lineId: string) => void;
  updateLine: (lineId: string, patch: Partial<Omit<CartLine, "lineId">>) => void;
  clear: () => void;
  countForRoom: (roomId: string) => number;
  remainingForRoom: (room: Room) => number;
  isRoomAvailableForRange: (room: Room) => boolean;
  computeLineGross: (line: CartLine) => number;
  subtotal: number;
  catalog: BookingCatalog;
}

const BookingCartContext = createContext<BookingCartValue | null>(null);

export function BookingCartProvider({
  catalog,
  homestayId,
  children,
}: {
  catalog: BookingCatalog;
  homestayId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, { dateRange: undefined, lines: [] });
  // Live availability (refreshed client-side); seeds from server-provided ranges.
  const [liveBookedRanges, setLiveBookedRangesState] = useReducer(
    (_: BookedRange[], next: BookedRange[]) => next,
    catalog.bookedRanges,
  );

  const setDates = useCallback((dateRange?: DateRange) => dispatch({ type: "SET_DATES", dateRange }), []);
  const addLine = useCallback((line: CartLine) => dispatch({ type: "ADD_LINE", line }), []);
  const removeLine = useCallback((lineId: string) => dispatch({ type: "REMOVE_LINE", lineId }), []);
  const updateLine = useCallback(
    (lineId: string, patch: Partial<Omit<CartLine, "lineId">>) => dispatch({ type: "UPDATE_LINE", lineId, patch }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const setLiveBookedRanges = useCallback((ranges: BookedRange[]) => setLiveBookedRangesState(ranges), []);

  // Refresh live availability client-side so every booking surface (date bars,
  // rooms, checkout) sees the latest bookings, not just the server snapshot.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/availability?homestay_id=${homestayId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.bookedRanges) setLiveBookedRanges(data.bookedRanges);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [homestayId, setLiveBookedRanges]);

  const { dateRange, lines } = state;

  const nights = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 0;
    const last = subDays(dateRange.to, 1);
    if (last < dateRange.from) return 0;
    return eachDayOfInterval({ start: dateRange.from, end: last }).length;
  }, [dateRange]);

  const rangeNightKeys = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [] as string[];
    const last = subDays(dateRange.to, 1);
    if (last < dateRange.from) return [] as string[];
    return eachDayOfInterval({ start: dateRange.from, end: last }).map((d) => format(d, "yyyy-MM-dd"));
  }, [dateRange]);

  const seasonsByRoom = useMemo(() => {
    const map: Record<string, RoomSeasonalPrice[]> = {};
    for (const s of catalog.seasonalPrices) {
      (map[s.room_id] ||= []).push(s);
    }
    return map;
  }, [catalog.seasonalPrices]);

  const specialsByRoom = useMemo(() => {
    const map: Record<string, RoomSpecialPrice[]> = {};
    for (const s of catalog.specialPrices) {
      (map[s.room_id] ||= []).push(s);
    }
    return map;
  }, [catalog.specialPrices]);

  const countForRoom = useCallback(
    (roomId: string) => lines.filter((l) => l.roomId === roomId).length,
    [lines],
  );

  const remainingForRoom = useCallback(
    (room: Room) => Math.max(0, (room.quantity || 1) - lines.filter((l) => l.roomId === room.id).length),
    [lines],
  );

  const isRoomAvailableForRange = useCallback(
    (room: Room): boolean => {
      if (rangeNightKeys.length === 0) return false;
      const blockedForRoom = new Set(
        catalog.blockedDates.filter((d) => d.room_id === null || d.room_id === room.id).map((d) => d.date),
      );
      if (rangeNightKeys.some((k) => blockedForRoom.has(k))) return false;
      const fully = getFullyBookedForRoom(room.id, room.quantity || 1, liveBookedRanges);
      if (rangeNightKeys.some((k) => fully.has(k))) return false;
      return true;
    },
    [rangeNightKeys, catalog.blockedDates, liveBookedRanges],
  );

  const computeLineGross = useCallback(
    (line: CartLine): number => {
      if (!dateRange?.from || !dateRange?.to || nights <= 0) return 0;
      const room = catalog.rooms.find((r) => r.id === line.roomId);
      if (!room) return 0;
      const seasons = seasonsByRoom[room.id] || [];
      const specialPrices = specialsByRoom[room.id] || [];
      const base = calculateTotalPrice({
        basePricePerNight: room.price_per_night,
        checkIn: dateRange.from,
        checkOut: dateRange.to,
        seasons,
        specialPrices,
      }).total;
      const opts = line.optionIds.reduce((s, id) => {
        const o = catalog.roomOptions.find((ro) => ro.id === id);
        if (!o) return s;
        return s + (o.pricing_type === "per_time" ? o.price : o.price * nights);
      }, 0);
      const perNight = line.tierIds.reduce((s, id) => {
        const g = catalog.guestPricing.find((t) => t.id === id);
        return g ? s + g.surcharge : s;
      }, 0);
      const comp = computeCompositionSurcharge(perNight, nights);
      return base + opts + comp;
    },
    [dateRange, nights, catalog.rooms, catalog.roomOptions, catalog.guestPricing, seasonsByRoom, specialsByRoom],
  );

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + computeLineGross(line), 0),
    [lines, computeLineGross],
  );

  const value = useMemo<BookingCartValue>(
    () => ({
      dateRange,
      lines,
      nights,
      liveBookedRanges,
      setLiveBookedRanges,
      setDates,
      addLine,
      removeLine,
      updateLine,
      clear,
      countForRoom,
      remainingForRoom,
      isRoomAvailableForRange,
      computeLineGross,
      subtotal,
      catalog,
    }),
    [dateRange, lines, nights, liveBookedRanges, setLiveBookedRanges, setDates, addLine, removeLine, updateLine, clear, countForRoom, remainingForRoom, isRoomAvailableForRange, computeLineGross, subtotal, catalog],
  );

  return <BookingCartContext.Provider value={value}>{children}</BookingCartContext.Provider>;
}

export function useBookingCartOptional(): BookingCartValue | null {
  return useContext(BookingCartContext);
}

export function useBookingCart(): BookingCartValue {
  const ctx = useContext(BookingCartContext);
  if (!ctx) throw new Error("useBookingCart must be used within a BookingCartProvider");
  return ctx;
}
