// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/calendar", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import CalendarPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T05:00:00Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  h.createClient.mockReturnValue(
    createSupabaseMock({
      user: { id: "owner-1" },
      tables: {
        hosts: { data: { id: "host-1" } },
        homestays: { data: { id: "hs-1" } },
        rooms: { data: [] },
        bookings: { data: [] },
        blocked_dates: { data: [{ id: "b-1", homestay_id: "hs-1", room_id: null, date: "2026-11-25", reason: "ซ่อมหลังคา" }] },
      },
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

// Unblocking used to need a 500 ms long-press: no keyboard or screen-reader way in.
describe("CalendarPage: unblocking a date", () => {
  it("offers Unblock in a blocked day's details, which opens the unblock confirmation", async () => {
    await act(async () => root.render(createElement(CalendarPage)));
    await act(async () => {});

    const day = [...container.querySelectorAll("button[aria-label]")].find((b) => b.getAttribute("aria-label")?.startsWith("25 "));
    expect(day?.getAttribute("aria-label")).toContain("ซ่อมหลังคา");
    await act(async () => (day as HTMLButtonElement).click());

    const unblock = buttonByText("unblockDate");
    expect(unblock).toBeTruthy();
    await act(async () => unblock!.click());

    // The existing confirmation, set up for one blocked date.
    expect(document.body.textContent).toContain("confirmUnblock");
    expect(document.body.textContent).toContain("1 datesSelected");
  });
});
