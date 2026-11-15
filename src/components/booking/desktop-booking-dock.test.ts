// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cart = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
  useLocale: () => "en",
}));
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/booking/use-booking-bar-visible", () => ({ useBookingBarVisible: (enabled: boolean) => enabled }));
vi.mock("@/components/booking/booking-cart-context", () => ({ useBookingCartOptional: () => cart.value }));
vi.mock("@/components/booking/booking-calendar-dialog", () => ({
  BookingCalendarDialog: ({ open }: { open: boolean }) => (open ? createElement("div", { role: "dialog" }) : null),
}));

import { DesktopBookingDock } from "@/components/booking/desktop-booking-dock";

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
});

const withCart = (over: { dates?: boolean; lines?: number } = {}) => {
  const dates = over.dates ? { from: new Date(2026, 10, 20), to: new Date(2026, 10, 22) } : undefined;
  cart.value = { dateRange: dates, nights: dates ? 2 : 0, lines: Array.from({ length: over.lines ?? 0 }), subtotal: 3600, catalog: { rooms: [{}] } };
};
const render = (bookingDisabled = false) => act(() => root.render(createElement(DesktopBookingDock, { bookingDisabled })));
const button = () => container.querySelector("button")!;
const dialog = () => document.body.querySelector('[role="dialog"]');

describe("DesktopBookingDock", () => {
  it("asks for dates first, and its button opens the calendar", () => {
    withCart();
    render();
    expect(container.textContent).toContain("selectDatesFirst");
    expect(button().textContent).toBe("chooseStayDates");
    act(() => button().click());
    expect(dialog()).not.toBeNull();
  });

  it("with dates but no house, says so and offers to change the dates", () => {
    withCart({ dates: true });
    render();
    expect(container.textContent).toContain("2 nights");
    expect(container.textContent).toContain("noRoomSelected");
    expect(button().textContent).toBe("changeDates");
  });

  it("with houses chosen, shows their count and total and goes straight to the booking steps", () => {
    withCart({ dates: true, lines: 2 });
    const proceed = vi.fn();
    document.addEventListener("proceed-booking", proceed);
    render();
    expect(container.textContent).toContain("roomsCount:2");
    expect(container.textContent).toContain("฿3,600");
    expect(button().textContent).toBe("bookNow");
    act(() => button().click());
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    document.removeEventListener("proceed-booking", proceed);
  });

  it("with houses chosen but the stay not fully picked, asks for dates instead of booking", () => {
    withCart({ lines: 2 });
    const proceed = vi.fn();
    document.addEventListener("proceed-booking", proceed);
    render();
    expect(button().textContent).toBe("chooseStayDates");
    act(() => button().click());
    document.removeEventListener("proceed-booking", proceed);
    expect(proceed).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it("is not shown while bookings are off", () => {
    withCart({ dates: true });
    render(true);
    expect(button()).toBeNull();
  });
});
