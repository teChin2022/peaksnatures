"use client";

import { createContext, useContext, useReducer, useMemo, useCallback, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";

/**
 * One room added to the cart. Dates are shared across the whole cart (stored on
 * the context, not per line), so a line only carries the room + its per-room
 * guest/tier/option choices. `lineId` lets the same room appear more than once
 * (up to its remaining quantity).
 */
export interface CartLine {
  lineId: string;
  roomId: string;
  numGuests: number;
  tierId: string | null;
  optionIds: string[];
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
      return { dateRange: undefined, lines: [] };
    default:
      return state;
  }
}

export interface BookingCartValue {
  dateRange?: DateRange;
  lines: CartLine[];
  setDates: (dateRange?: DateRange) => void;
  addLine: (line: CartLine) => void;
  removeLine: (lineId: string) => void;
  updateLine: (lineId: string, patch: Partial<Omit<CartLine, "lineId">>) => void;
  clear: () => void;
  /** How many lines currently hold a given room (to cap "Add" by remaining quantity). */
  countForRoom: (roomId: string) => number;
}

const BookingCartContext = createContext<BookingCartValue | null>(null);

export function BookingCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { dateRange: undefined, lines: [] });

  const setDates = useCallback((dateRange?: DateRange) => dispatch({ type: "SET_DATES", dateRange }), []);
  const addLine = useCallback((line: CartLine) => dispatch({ type: "ADD_LINE", line }), []);
  const removeLine = useCallback((lineId: string) => dispatch({ type: "REMOVE_LINE", lineId }), []);
  const updateLine = useCallback(
    (lineId: string, patch: Partial<Omit<CartLine, "lineId">>) => dispatch({ type: "UPDATE_LINE", lineId, patch }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const countForRoom = useCallback(
    (roomId: string) => state.lines.filter((l) => l.roomId === roomId).length,
    [state.lines],
  );

  const value = useMemo<BookingCartValue>(
    () => ({
      dateRange: state.dateRange,
      lines: state.lines,
      setDates,
      addLine,
      removeLine,
      updateLine,
      clear,
      countForRoom,
    }),
    [state.dateRange, state.lines, setDates, addLine, removeLine, updateLine, clear, countForRoom],
  );

  return <BookingCartContext.Provider value={value}>{children}</BookingCartContext.Provider>;
}

/**
 * Read the booking cart. Returns null when used outside a provider so callers
 * (e.g. a homestay page that hasn't opted into the cart) can no-op safely.
 */
export function useBookingCartOptional(): BookingCartValue | null {
  return useContext(BookingCartContext);
}

export function useBookingCart(): BookingCartValue {
  const ctx = useContext(BookingCartContext);
  if (!ctx) throw new Error("useBookingCart must be used within a BookingCartProvider");
  return ctx;
}
