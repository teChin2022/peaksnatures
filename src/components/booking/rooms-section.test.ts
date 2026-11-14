// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomLightbox, RoomsSection, SingleRoomHero } from "@/components/booking/rooms-section";
import type { BlockedDate, Room } from "@/types/database";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photos = (count: number) => Array.from({ length: count }, (_, i) => `/photo-${i + 1}.jpg`);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // motion's whileInView needs one; happy-dom has none.
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

const render = (images: string[]) =>
  act(() => root.render(createElement(RoomLightbox, { images, name: "Baan", startIndex: 0, onClose: () => {} })));
const thumbs = () => [...container.querySelectorAll("button[aria-current]")] as HTMLButtonElement[];

describe("RoomLightbox thumbnails", () => {
  it("shows one thumbnail per photo and jumps to the tapped one", () => {
    render(photos(4));
    expect(thumbs()).toHaveLength(4);
    expect(thumbs()[0].getAttribute("aria-current")).toBe("true");
    expect(thumbs()[2].getAttribute("aria-label")).toBe("goToPhoto");

    act(() => thumbs()[2].click());
    expect(container.textContent).toContain("3 / 4");
    expect(thumbs()[2].getAttribute("aria-current")).toBe("true");
    expect(thumbs()[0].getAttribute("aria-current")).toBe("false");
  });

  it("shows no strip for a single photo", () => {
    render(photos(1));
    expect(thumbs()).toHaveLength(0);
  });

  it("names its icon-only controls", () => {
    render(photos(3));
    const labels = [...container.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(["close", "prevPhoto", "nextPhoto"]));
    // Every button has a name: the icon ones by label, the thumbnails by "goToPhoto".
    expect(labels.every(Boolean)).toBe(true);
  });
});

const room = (over: Partial<Room> = {}) =>
  ({ id: "r1", name: "Baan Mok", description: null, price_per_night: 1500, max_guests: 2, quantity: 2, images: photos(3), is_active: true, ...over }) as Room;

function card(props: Partial<Parameters<typeof SingleRoomHero>[0]> = {}) {
  const calls = { add: 0, edit: 0, calendar: 0 };
  act(() =>
    root.render(
      createElement(SingleRoomHero, {
        room: room(),
        seasonalPrices: [],
        specialPrices: [],
        onLightbox: () => {},
        onCalendar: () => calls.calendar++,
        onDesc: () => {},
        onAddToCart: () => calls.add++,
        onEdit: () => calls.edit++,
        cartEnabled: true,
        bookingLocked: false,
        ...props,
      }),
    ),
  );
  return calls;
}
const buttonsNamed = (text: string) => [...container.querySelectorAll("button")].filter((b) => b.textContent?.includes(text));

describe("SingleRoomHero house card", () => {
  it("renders one main button, disabled with a hint until both dates are chosen", () => {
    card({ datesChosen: false });
    expect(buttonsNamed("selectThisRoom")).toHaveLength(1);
    expect(buttonsNamed("selectThisRoom")[0].disabled).toBe(true);
    expect(container.textContent).toContain("pickDatesFirst");
  });

  it("adds the house once dates are chosen", () => {
    const calls = card({ datesChosen: true, remaining: 2 });
    const [main] = buttonsNamed("selectThisRoom");
    expect(main.disabled).toBe(false);
    expect(container.textContent).not.toContain("pickDatesFirst");
    act(() => main.click());
    expect(calls.add).toBe(1);
  });

  it("switches to editing, outlines the card and counts the house once every free unit is in the cart", () => {
    const calls = card({ datesChosen: true, remaining: 0, inCart: 2 });
    expect(buttonsNamed("selectThisRoom")).toHaveLength(0);
    act(() => buttonsNamed("inCartEdit")[0].click());
    expect(calls.edit).toBe(1);
    expect(container.textContent).toContain("selectedCount");
    expect(container.querySelector("[data-room-id]")?.className).toContain("ring-pine");
  });

  it("stays locked while the guest is past the dates step", () => {
    card({ datesChosen: true, remaining: 2, bookingLocked: true });
    expect(buttonsNamed("selectThisRoom")[0].disabled).toBe(true);
  });

  it("opens availability and prices, and jumps to a tapped thumbnail", () => {
    const calls = card();
    act(() => buttonsNamed("viewCalendar")[0].click());
    expect(calls.calendar).toBe(1);
    expect(container.textContent).toContain("1 / 3");
    const thumbs = [...container.querySelectorAll<HTMLButtonElement>("button[aria-current]")];
    expect(thumbs).toHaveLength(3);
    act(() => thumbs[2].click());
    expect(container.textContent).toContain("3 / 3");
  });

  it("shows a closed house without any booking action", () => {
    card({ room: room({ is_active: false }), datesChosen: true, remaining: 2 });
    expect(container.textContent).toContain("temporarilyClosed");
    expect(buttonsNamed("selectThisRoom")).toHaveLength(0);
    expect(buttonsNamed("viewCalendar")).toHaveLength(0);
  });
});

describe("the house card's availability calendar", () => {
  it("is view only, and marks a booked night in words as well as colour", () => {
    vi.useFakeTimers({ now: new Date(2026, 11, 1), toFake: ["Date"] });
    try {
      act(() =>
        root.render(
          createElement(RoomsSection, {
            rooms: [room()],
            blockedDates: [{ id: "b1", room_id: null, date: "2026-12-20" } as BlockedDate],
          }),
        ),
      );
      act(() => buttonsNamed("viewCalendar")[0].click());

      const grid = document.body.querySelector('[role="dialog"] [role="grid"]')!;
      expect(grid.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(27);
      // Text, not buttons: tapping a day did nothing, so it no longer looks tappable.
      expect(grid.querySelectorAll("button")).toHaveLength(0);

      const booked = [...grid.querySelectorAll('[role="gridcell"]')].filter((c) => c.className.includes("line-through"));
      expect(booked).toHaveLength(1);
      expect(booked[0].textContent).toBe("20");
      expect(booked[0].getAttribute("aria-label")).toMatch(/, legendBooked$/);
    } finally {
      vi.useRealTimers();
    }
  });
});
