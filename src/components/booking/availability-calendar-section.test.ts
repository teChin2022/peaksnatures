// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@/types/database";
import type { CartLine } from "@/components/booking/booking-cart-context";

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  available: true,
  remaining: 1,
  lines: [] as CartLine[],
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("sonner", () => ({ toast: { error: h.toastError } }));
vi.mock("@/lib/demand-track", () => ({ trackDemandOnce: () => {} }));

const house = {
  id: "r1", name: "Baan Mok", description: null, price_per_night: 1500, max_guests: 2,
  quantity: 1, images: [], is_active: true,
} as unknown as Room;

vi.mock("@/components/booking/booking-cart-context", () => ({
  useBookingCart: () => ({
    catalog: { rooms: [house], blockedDates: [], seasonalPrices: [], specialPrices: [] },
    liveBookedRanges: [],
    setDates: () => {},
    lines: h.lines,
    isRoomAvailableForRange: () => h.available,
    remainingForRoom: () => h.remaining,
  }),
}));
// The real picker is covered by its own test; this one only needs its Done.
vi.mock("@/components/booking/booking-calendar-dialog", () => ({
  BookingCalendarDialog: ({ open, onDone }: { open: boolean; onDone?: () => void }) =>
    open ? createElement("button", { type: "button", onClick: onDone }, "picker-done") : null,
}));
vi.mock("@/components/booking/room-config-dialog", () => ({
  RoomConfigDialog: ({ open, room, editingLine }: { open: boolean; room: Room | null; editingLine: CartLine | null }) =>
    open ? createElement("div", { "data-testid": "config" }, `${room?.name}${editingLine ? " editing" : ""}`) : null,
}));

import { AvailabilityCalendarSection } from "@/components/booking/availability-calendar-section";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
  h.toastError.mockReset();
  h.available = true;
  h.remaining = 1;
  h.lines = [];
});

const button = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
const tick = () => act(() => vi.advanceTimersByTime(150));
const config = () => document.body.querySelector('[data-testid="config"]');

/** Day → ดูรายละเอียด → จองบ้านพักนี้ → (picker) เสร็จสิ้น. */
function bookFromCalendar() {
  act(() => root.render(createElement(AvailabilityCalendarSection, { homestayId: "h1" })));
  // Status-labelled days are the bookable ones; past days have no label.
  const day = [...container.querySelectorAll("button[aria-label]")].find((b) =>
    b.getAttribute("aria-label")?.includes(" — "),
  ) as HTMLButtonElement;
  act(() => day.click());
  act(() => button("viewDetails").click());
  act(() => button("bookThisHouse").click());
  tick();
  act(() => button("picker-done").click());
  tick();
}

describe("AvailabilityCalendarSection booking from a day", () => {
  it("opens the chosen house's config dialog when the picker is done", () => {
    bookFromCalendar();
    expect(config()?.textContent).toBe("Baan Mok");
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("edits the house's cart line once every unit is already in the cart", () => {
    h.remaining = 0;
    h.lines = [{ lineId: "l1", roomId: "r1", numGuests: 2, tierIds: [], optionIds: [] }];
    bookFromCalendar();
    expect(config()?.textContent).toBe("Baan Mok editing");
  });

  it("says the house is unavailable instead of opening it", () => {
    h.available = false;
    bookFromCalendar();
    expect(config()).toBeNull();
    expect(h.toastError).toHaveBeenCalledWith("roomUnavailableToast");
  });
});
