// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@/types/database";
import type { CartLine } from "@/components/booking/booking-cart-context";

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  setDates: vi.fn(),
  available: true,
  remaining: 1,
  lines: [] as CartLine[],
  booked: [] as { room_id: string; check_in: string; check_out: string }[],
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
    liveBookedRanges: h.booked,
    setDates: h.setDates,
    lines: h.lines,
    isRoomAvailableForRange: () => h.available,
    remainingForRoom: () => h.remaining,
  }),
}));
// The real picker is covered by its own test; this one only needs its Done and scope.
vi.mock("@/components/booking/booking-calendar-dialog", () => ({
  BookingCalendarPanel: ({ roomId, onDone }: { roomId: string | null; onDone: () => void }) =>
    createElement("button", { type: "button", "data-room": roomId, onClick: onDone }, "picker-done"),
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
  h.setDates.mockReset();
  h.available = true;
  h.remaining = 1;
  h.lines = [];
  h.booked = [];
});

const button = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
const tick = () => act(() => vi.advanceTimersByTime(150));
const config = () => document.body.querySelector('[data-testid="config"]');
const dialogs = () => document.body.querySelectorAll('[role="dialog"]');
const title = () => document.body.querySelector('[role="dialog"] h2')?.textContent;

/** Renders the section and taps the first day that has a status (past days have none). */
function openDay() {
  act(() => root.render(createElement(AvailabilityCalendarSection, { homestayId: "h1" })));
  const day = [...container.querySelectorAll("button[aria-label]")].find((b) =>
    b.getAttribute("aria-label")?.includes(" — "),
  ) as HTMLButtonElement;
  act(() => day.click());
}

/** Day → ดูรายละเอียด → จองบ้านพักนี้ → เสร็จสิ้น. */
function bookFromDetail() {
  openDay();
  act(() => button("viewDetails").click());
  act(() => button("bookThisHouse").click());
  act(() => button("picker-done").click());
  tick();
}

describe("AvailabilityCalendarSection: the day's house list", () => {
  it("books a free house straight from its row, without opening the details", () => {
    openDay();
    act(() => button("bookThisHouse").click());
    expect(title()).toBe("selectDates");
    expect(button("picker-done").dataset.room).toBe("r1");
    expect(h.setDates).toHaveBeenCalledWith({ from: expect.any(Date), to: undefined });
  });

  it("offers neither action on a house with nothing left that night", () => {
    // Its only unit booked for every night from long ago to long ahead.
    h.booked = [{ room_id: "r1", check_in: "2000-01-01", check_out: "2100-01-01" }];
    openDay();
    const row = document.body.querySelector('[role="dialog"] li')!;
    expect(row.textContent).toContain("roomBooked");
    expect(row.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("AvailabilityCalendarSection: the check-out picker", () => {
  it("shows in the same dialog, and Back returns to where the guest came from", () => {
    openDay();
    act(() => button("viewDetails").click());
    act(() => button("bookThisHouse").click());
    expect(dialogs()).toHaveLength(1);
    expect(title()).toBe("selectDates");

    act(() => (document.body.querySelector('[aria-label="back"]') as HTMLButtonElement).click());
    expect(title()).toBe("Baan Mok");
    act(() => (document.body.querySelector('[aria-label="back"]') as HTMLButtonElement).click());
    expect(button("viewDetails")).toBeDefined();
  });

  it("opens the chosen house's config dialog when the picker is done", () => {
    bookFromDetail();
    expect(dialogs()).toHaveLength(0);
    expect(config()?.textContent).toBe("Baan Mok");
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("edits the house's cart line once every unit is already in the cart", () => {
    h.remaining = 0;
    h.lines = [{ lineId: "l1", roomId: "r1", numGuests: 2, tierIds: [], optionIds: [] }];
    bookFromDetail();
    expect(config()?.textContent).toBe("Baan Mok editing");
  });

  it("says the house is unavailable instead of opening it", () => {
    h.available = false;
    bookFromDetail();
    expect(config()).toBeNull();
    expect(h.toastError).toHaveBeenCalledWith("roomUnavailableToast");
  });
});
