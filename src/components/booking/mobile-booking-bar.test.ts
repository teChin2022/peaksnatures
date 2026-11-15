// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@/types/database";

const cart = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
  useLocale: () => "en",
}));
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/booking/use-booking-bar-visible", () => ({ useBookingBarVisible: (enabled: boolean) => enabled }));
vi.mock("@/components/booking/booking-cart-context", () => ({ useBookingCartOptional: () => cart.value }));
vi.mock("@/components/booking/booking-calendar-dialog", () => ({
  BookingCalendarDialog: ({ open }: { open: boolean }) => (open ? createElement("div", { "data-testid": "calendar" }) : null),
}));

import { MobileBookingBar } from "@/components/booking/mobile-booking-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const withCart = (lines: number, dates = true) => {
  cart.value = {
    dateRange: dates ? { from: new Date(2026, 10, 20), to: new Date(2026, 10, 22) } : undefined,
    nights: dates ? 2 : 0,
    lines: Array.from({ length: lines }),
    subtotal: 3600,
  };
};
const render = (bookingDisabled = false) =>
  act(() => root.render(createElement(MobileBookingBar, { rooms: [{ id: "r1" } as Room], bookingDisabled })));
const buttons = () => [...container.querySelectorAll("button")];

describe("MobileBookingBar", () => {
  it("with nothing chosen, is one Book button carrying the dates", () => {
    withCart(0);
    render();
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent).toContain("bookHouse");
    expect(buttons()[0].textContent).toContain("2 nights");
  });

  it("opens the calendar from the Book button", () => {
    withCart(0, false);
    render();
    act(() => buttons()[0].click());
    expect(document.body.querySelector('[data-testid="calendar"]')).not.toBeNull();
  });

  // No cart: once a house is chosen the bar is the way on to the guest details.
  it("with houses chosen, shows their count, total and dates, and Book Now goes straight to checkout", () => {
    withCart(2);
    render();
    expect(container.textContent).toContain("roomsCount:2");
    expect(container.textContent).toContain("฿3,600");
    expect(container.textContent).toContain("20 Nov – 22 Nov · 2 nights");
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent).toBe("bookNow");
    const proceed = vi.fn();
    document.addEventListener("proceed-booking", proceed);
    act(() => buttons()[0].click());
    document.removeEventListener("proceed-booking", proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[data-testid="calendar"]')).toBeNull();
  });

  // A half-picked range prices nothing, so chosen houses can't be booked from it.
  it("keeps the Book button while the stay is not fully picked, even with houses chosen", () => {
    withCart(2, false);
    render();
    expect(buttons()[0].textContent).toContain("bookHouse");
    expect(container.textContent).not.toContain("bookNow");
  });

  it("turns its button off while bookings are off", () => {
    withCart(1);
    render(true);
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
