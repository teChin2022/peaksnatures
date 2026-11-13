// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cart = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
vi.mock("@/components/booking/booking-cart-context", () => ({ useBookingCartOptional: () => cart.value }));
// The real dialog needs the whole cart; the panel only decides when it opens.
vi.mock("@/components/booking/booking-calendar-dialog", () => ({
  BookingCalendarDialog: ({ open }: { open: boolean }) => (open ? createElement("div", { role: "dialog" }) : null),
}));

import { DesktopDateSearch } from "@/components/booking/desktop-date-search";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const withCart = (dateRange: { from?: Date; to?: Date } | undefined, nights = 0, rooms = 1) => {
  cart.value = { dateRange, nights, catalog: { rooms: Array.from({ length: rooms }, () => ({})) } };
};
const render = (bookingDisabled = false) => act(() => root.render(createElement(DesktopDateSearch, { bookingDisabled })));
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("DesktopDateSearch date panel", () => {
  it("asks for dates and opens the calendar from the button before any are chosen", () => {
    withCart(undefined);
    render();
    expect(container.textContent).toContain("selectDates");
    act(() => button("chooseStayDates")!.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("shows both dates and the nights, and jumps to the houses instead of reopening the calendar", () => {
    withCart({ from: new Date(2026, 10, 20), to: new Date(2026, 10, 22) }, 2);
    const rooms = document.createElement("section");
    rooms.id = "rooms-section";
    rooms.scrollIntoView = vi.fn();
    document.body.append(rooms);
    render();
    expect(container.textContent).toContain("20");
    expect(container.textContent).toContain("22");
    expect(container.textContent).toContain("2nights");
    act(() => button("seeAvailableHouses")!.click());
    expect(rooms.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    rooms.remove();
  });

  it("opens the calendar from either date field", () => {
    withCart(undefined);
    render();
    act(() => button("checkOutLabel")!.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("is left out while bookings are off or the homestay has no house", () => {
    withCart(undefined);
    render(true);
    expect(container.innerHTML).toBe("");
    withCart(undefined, 0, 0);
    render(false);
    expect(container.innerHTML).toBe("");
  });
});
