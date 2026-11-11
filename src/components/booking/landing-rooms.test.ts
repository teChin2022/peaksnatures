// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingRooms, type LandingRoom } from "@/components/booking/landing-rooms";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom does no layout; the description's cut is covered in expandable-text.test.ts.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

const ROOM: LandingRoom = {
  id: "room-1",
  name: "บ้านริมธาร",
  description: "<p>ตื่นมากับทะเลหมอก</p>",
  price_per_night: 1500,
  max_guests: 2,
  images: [],
  is_active: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = (rooms: LandingRoom[], bookingDisabled?: boolean) =>
  act(() => root.render(createElement(LandingRooms, { rooms, bookHref: "/baan/book", bookingDisabled })));
const bookLinks = () => container.querySelectorAll('a[href="/baan/book"]');

describe("LandingRooms", () => {
  it("shows each house with its description and standard rate", () => {
    render([ROOM]);
    expect(container.textContent).toContain("บ้านริมธาร");
    expect(container.textContent).toContain("ตื่นมากับทะเลหมอก");
    expect(container.textContent).toContain("฿1,500");
  });

  it("renders nothing without houses", () => {
    render([]);
    expect(container.innerHTML).toBe("");
  });

  it("gives each open house a link on to the booking page", () => {
    render([ROOM, { ...ROOM, id: "room-2", name: "บ้านบนดอย" }]);
    expect(bookLinks()).toHaveLength(2);
    expect(bookLinks()[0].textContent).toContain("checkAvailability");
  });

  it("leaves the link off a closed house, and off every house while bookings are off", () => {
    render([ROOM, { ...ROOM, id: "room-2", is_active: false }]);
    expect(bookLinks()).toHaveLength(1);
    render([ROOM], true);
    expect(bookLinks()).toHaveLength(0);
  });

  it("says how paying works under the heading, but not while bookings are off", () => {
    render([ROOM]);
    expect(container.textContent).toContain("paymentNote");
    render([ROOM], true);
    expect(container.textContent).not.toContain("paymentNote");
  });

  it("keeps the price and the link to /book in one row, with lining figures", () => {
    render([ROOM]);
    const link = bookLinks()[0];
    const row = link.parentElement!;
    expect(row.textContent).toContain("฿1,500");
    const price = [...row.querySelectorAll("span")].find((el) => el.textContent === "฿1,500")!;
    expect(price.getAttribute("style")).toContain("lnum");
  });
});
