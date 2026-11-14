// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDate } from "@/lib/format-date";

const intl = vi.hoisted(() => ({ locale: "th" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => intl.locale }));
const from = new Date(2026, 11, 24);
const to = new Date(2026, 11, 26);
vi.mock("@/components/booking/booking-cart-context", () => ({
  useBookingCart: () => ({
    dateRange: { from, to },
    setDates: () => {},
    nights: 2,
    catalog: { rooms: [], blockedDates: [] },
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
