// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Room, RoomGuestPricing } from "@/types/database";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const tier = (id: string, adults: number, surcharge: number, sort_order: number) =>
  ({ id, room_id: "r1", adults, children: 0, detail: null, surcharge, sort_order }) as unknown as RoomGuestPricing;

vi.mock("@/components/booking/booking-cart-context", () => ({
  useBookingCart: () => ({
    catalog: {
      rooms: [],
      seasonalPrices: [],
      specialPrices: [],
      roomOptions: [],
      guestPricing: [tier("t2", 2, 0, 0), tier("t3", 3, 500, 1)],
    },
    dateRange: { from: new Date(2026, 10, 18), to: new Date(2026, 10, 20) },
    nights: 2,
    computeLineGross: () => 3000,
    addLine: vi.fn(),
    updateLine: vi.fn(),
    remainingForRoom: () => 1,
  }),
}));

import { RoomConfigDialog } from "@/components/booking/room-config-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room = { id: "r1", name: "Baan Mok", price_per_night: 1500, max_guests: 4, quantity: 1, images: [], is_active: true } as unknown as Room;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(RoomConfigDialog, { room, open: true, onClose: () => {} })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const tierButtons = () => [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];

describe("RoomConfigDialog guest tiers and total", () => {
  it("says which tier is chosen, and none until the guest picks one", () => {
    expect(tierButtons()).toHaveLength(2);
    expect(tierButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    act(() => tierButtons()[1].click());
    expect(tierButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("puts the dates and nights beside the total once a tier is chosen", () => {
    act(() => tierButtons()[0].click());
    expect(document.body.textContent).toContain("18 พ.ย. – 20 พ.ย. · 2 nights");
  });
});
