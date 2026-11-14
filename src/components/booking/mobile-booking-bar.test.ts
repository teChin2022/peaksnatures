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
  it("puts the cart tile first, then the Book button carrying the dates", () => {
    withCart(0);
    render();
    const [tile, book] = buttons();
    expect(tile.getAttribute("aria-label")).toBe("yourCart");
    expect(book.textContent).toContain("bookHouse");
    expect(book.textContent).toContain("2 nights");
  });

  it("counts the houses in the cart on the tile, and in its name", () => {
    withCart(2);
    render();
    const [tile] = buttons();
    expect(tile.textContent).toBe("2");
    expect(tile.getAttribute("aria-label")).toBe("yourCart · roomsCount:2");
  });

  // Same as the desktop header cart: a red count, and the same cart dialog (HeaderCart listens for open-cart).
  it("shows the count in red and opens the shared cart dialog", () => {
    withCart(1);
    render();
    const [tile] = buttons();
    expect(tile.querySelector("span")?.className).toContain("bg-[#F83858]");
    const opened = vi.fn();
    document.addEventListener("open-cart", opened);
    act(() => tile.click());
    document.removeEventListener("open-cart", opened);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("opens the calendar from the Book button", () => {
    withCart(0, false);
    render();
    act(() => buttons()[1].click());
    expect(document.body.querySelector('[data-testid="calendar"]')).not.toBeNull();
  });

  it("dims both buttons and turns them off while bookings are off", () => {
    withCart(1);
    render(true);
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
