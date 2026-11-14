// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Room, RoomSeasonalPrice, RoomSpecialPrice } from "@/types/database";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("@/lib/special-price-label", () => ({ formatSpecialPriceRule: () => "rule" }));

import { RoomRateTable } from "@/components/booking/room-rate-table";

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

const room = { id: "r1", price_per_night: 1500 } as Room;
const season = (id: string, start: string, price: number) =>
  ({ id, name: id, start_date: start, end_date: start, price_per_night: price }) as RoomSeasonalPrice;

describe("RoomRateTable", () => {
  it("lists the base price, the special surcharges and the seasons in date order", () => {
    act(() =>
      root.render(
        createElement(RoomRateTable, {
          room,
          seasonalPrices: [season("late", "2026-12-20", 2500), season("early", "2026-04-10", 2000)],
          specialPrices: [{ id: "s1", name: "Weekend", surcharge: 300 } as RoomSpecialPrice],
        }),
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("฿1,500");
    expect(text).toContain("+฿300");
    expect(text.indexOf("early")).toBeLessThan(text.indexOf("late"));
  });

  it("shows only the base price when there are no other rates", () => {
    act(() => root.render(createElement(RoomRateTable, { room, seasonalPrices: [], specialPrices: [] })));
    expect(container.textContent).not.toContain("seasonalRates");
    expect(container.textContent).not.toContain("specialRates");
  });
});
