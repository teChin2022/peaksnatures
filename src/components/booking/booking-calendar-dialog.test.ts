// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDate } from "@/lib/format-date";

const intl = vi.hoisted(() => ({ locale: "th" }));
const cart = vi.hoisted(() => ({ blockedDates: [] as { room_id: string | null; date: string }[] }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => intl.locale }));
const from = new Date(2026, 11, 24);
const to = new Date(2026, 11, 26);
vi.mock("@/components/booking/booking-cart-context", () => ({
  useBookingCart: () => ({
    dateRange: { from, to },
    setDates: () => {},
    nights: 2,
    catalog: { rooms: [{ id: "r1", quantity: 1 }], blockedDates: cart.blockedDates },
    liveBookedRanges: [],
  }),
}));

import { BookingCalendarDialog } from "@/components/booking/booking-calendar-dialog";

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
  intl.locale = "th";
  cart.blockedDates = [];
  vi.useRealTimers();
});

const render = () => act(() => root.render(createElement(BookingCalendarDialog, { open: true, onOpenChange: () => {} })));

describe("BookingCalendarDialog date fields", () => {
  it("writes the check-in and check-out day first in Thai", () => {
    render();
    const text = document.body.textContent ?? "";
    expect(text).toContain(fmtDate(from, "d MMM yyyy", "th"));
    expect(text).toContain(fmtDate(to, "d MMM yyyy", "th"));
  });

  it("keeps the month first in English", () => {
    intl.locale = "en";
    render();
    expect(document.body.textContent).toContain("Dec 24, 2026");
  });
});

describe("BookingCalendarDialog booked nights", () => {
  // The rdp cell carries the modifier class; its `.day-btn` takes the look.
  const cell = (iso: string) => document.body.querySelector(`td[data-day="${iso}"]`)!;
  const looksBooked = (iso: string) => cell(iso).className.includes("line-through");

  it("strikes booked nights through, unlike past days and the picked check-out", () => {
    vi.useFakeTimers({ now: new Date(2026, 11, 20), toFake: ["Date"] });
    cart.blockedDates = [
      { room_id: null, date: "2026-12-10" }, // past
      { room_id: null, date: "2026-12-26" }, // the check-out, which a booked night may be
      { room_id: null, date: "2026-12-28" },
    ];
    render();
    expect(looksBooked("2026-12-28")).toBe(true);
    expect(looksBooked("2026-12-10")).toBe(false);
    expect(looksBooked("2026-12-26")).toBe(false);
    expect(looksBooked("2026-12-29")).toBe(false);
  });

  it("names a booked night by what it means: every house taken, or this house booked", () => {
    render();
    expect(document.body.textContent).toContain("legendFull");
    act(() => root.render(createElement(BookingCalendarDialog, { open: true, onOpenChange: () => {}, roomId: "r1" })));
    expect(document.body.textContent).toContain("legendBooked");
    expect(document.body.textContent).not.toContain("legendFull");
  });
});

describe("BookingCalendarDialog Done", () => {
  it("closes, then hands over to onDone, once both dates are picked", () => {
    const calls: string[] = [];
    act(() =>
      root.render(
        createElement(BookingCalendarDialog, {
          open: true,
          onOpenChange: (open: boolean) => calls.push(`open:${open}`),
          onDone: () => calls.push("done"),
        }),
      ),
    );
    const done = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "done")!;
    act(() => done.click());
    expect(calls).toEqual(["open:false", "done"]);
  });
});
