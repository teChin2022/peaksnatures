// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomLightbox, RoomsSection, SingleRoomHero } from "@/components/booking/rooms-section";
import { BookingCartProvider, useBookingCart, type BookingCartValue, type BookedRange } from "@/components/booking/booking-cart-context";
import type { BlockedDate, Room } from "@/types/database";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
  useLocale: () => "th",
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photos = (count: number) => Array.from({ length: count }, (_, i) => `/photo-${i + 1}.jpg`);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // motion's whileInView needs one; happy-dom has none.
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  // The cart provider refreshes availability on mount; never answering keeps the catalog's.
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// The lightbox renders in a portal (a Radix dialog), so its parts live under document.body.
let onClose = vi.fn();
const render = (images: string[]) => {
  onClose = vi.fn();
  act(() => root.render(createElement(RoomLightbox, { images, name: "Baan", startIndex: 0, onClose })));
};
const lightbox = () => document.querySelector("[role=dialog]") as HTMLElement;
const thumbs = () => [...document.body.querySelectorAll("button[aria-current]")] as HTMLButtonElement[];

describe("RoomLightbox thumbnails", () => {
  it("shows one thumbnail per photo and jumps to the tapped one", () => {
    render(photos(4));
    expect(thumbs()).toHaveLength(4);
    expect(thumbs()[0].getAttribute("aria-current")).toBe("true");
    expect(thumbs()[2].getAttribute("aria-label")).toBe("goToPhoto:3");

    act(() => thumbs()[2].click());
    expect(lightbox().textContent).toContain("3 / 4");
    expect(thumbs()[2].getAttribute("aria-current")).toBe("true");
    expect(thumbs()[0].getAttribute("aria-current")).toBe("false");
  });

  it("shows no strip for a single photo", () => {
    render(photos(1));
    expect(thumbs()).toHaveLength(0);
  });

  it("names its icon-only controls", () => {
    render(photos(3));
    const labels = [...lightbox().querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(["close", "prevPhoto", "nextPhoto"]));
    // Every button has a name: the icon ones by label, the thumbnails by "goToPhoto".
    expect(labels.every(Boolean)).toBe(true);
  });

  it("is a named dialog that Esc closes, with focus inside it", () => {
    render(photos(3));
    expect(lightbox().getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(lightbox().getAttribute("aria-labelledby")!)?.textContent).toBe("Baan");
    expect(lightbox().contains(document.activeElement)).toBe(true);
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

const room = (over: Partial<Room> = {}) =>
  ({ id: "r1", name: "Baan Mok", description: null, price_per_night: 1500, max_guests: 2, quantity: 2, images: photos(3), is_active: true, ...over }) as Room;

function card(props: Partial<Parameters<typeof SingleRoomHero>[0]> = {}) {
  const calls = { add: 0, calendar: 0 };
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

  it("chooses the house once dates are chosen", () => {
    const calls = card({ datesChosen: true, remaining: 2 });
    const [main] = buttonsNamed("selectThisRoom");
    expect(main.disabled).toBe(false);
    expect(container.textContent).not.toContain("pickDatesFirst");
    act(() => main.click());
    expect(calls.add).toBe(1);
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

// ---- The house list with the real chosen-houses state (the page has no cart) ----

// createElement wants `children` in the props type; here they come as arguments instead.
type ProviderProps = Parameters<typeof BookingCartProvider>[0];
const providerProps = (props: Omit<ProviderProps, "children">) => props as ProviderProps;
let cart: BookingCartValue;
const keepCart = (value: BookingCartValue) => {
  cart = value;
};
function Probe({ onCart }: { onCart: (value: BookingCartValue) => void }) {
  const value = useBookingCart();
  useEffect(() => onCart(value));
  return null;
}
const house = (id: string, over: Partial<Room> = {}) => room({ id, name: `Baan ${id}`, quantity: 1, ...over });
const stay = { from: new Date(2026, 11, 20), to: new Date(2026, 11, 22) };
const renderList = (rooms: Room[], bookedRanges: BookedRange[] = []) =>
  act(() =>
    root.render(
      createElement(
        BookingCartProvider,
        providerProps({ catalog: { rooms, seasonalPrices: [], specialPrices: [], roomOptions: [], guestPricing: [], blockedDates: [], bookedRanges }, homestayId: "h1" }),
        createElement(Probe, { onCart: keepCart }),
        createElement(RoomsSection, { rooms, bookedRanges }),
      ),
    ),
  );
const shownIds = () => [...container.querySelectorAll("[data-room-id]")].map((el) => el.getAttribute("data-room-id"));
const picked = (roomId: string | null = null) => act(() => void document.dispatchEvent(new CustomEvent("dates-picked", { detail: { roomId } })));
const choose = (lineId: string, roomId: string) => act(() => cart.addLine({ lineId, roomId, numGuests: 2, tierIds: [], optionIds: [] }));

describe("the house list after the date picker's Done", () => {
  it("lists every house until a full stay is picked, and after a check-in alone", () => {
    renderList([house("a"), house("b")]);
    expect(shownIds()).toEqual(["a", "b"]);
    act(() => cart.setDates({ from: stay.from, to: undefined }));
    picked();
    expect(shownIds()).toEqual(["a", "b"]);
  });

  it("starts at the first free house; 'see other houses' shows the rest and names the cheapest", () => {
    renderList([house("a", { price_per_night: 2000 }), house("b", { price_per_night: 900 }), house("c", { price_per_night: 1200 })]);
    act(() => cart.setDates(stay));
    picked();
    expect(shownIds()).toEqual(["a"]);
    expect(buttonsNamed("showOtherHouses")).toHaveLength(1);
    expect(container.textContent).toContain("moreHousesHint:2,900");
    act(() => buttonsNamed("showOtherHouses")[0].click());
    expect(shownIds()).toEqual(["a", "b", "c"]);
    expect(buttonsNamed("showOtherHouses")).toHaveLength(0);
  });

  it("skips a house that is not free, and starts at the house picked on the availability calendar", () => {
    renderList([house("a"), house("b"), house("c")], [{ room_id: "a", check_in: "2026-12-20", check_out: "2026-12-22" }]);
    act(() => cart.setDates(stay));
    picked();
    expect(shownIds()).toEqual(["b"]);
    picked("c");
    expect(shownIds()).toEqual(["c"]);
  });

  it("keeps chosen houses in view, and says 'book another house' once one is chosen", () => {
    renderList([house("a"), house("b"), house("c")]);
    act(() => cart.setDates(stay));
    choose("l1", "b");
    picked();
    expect(shownIds()).toEqual(["b"]);
    expect(buttonsNamed("bookMoreHouses")).toHaveLength(1);
  });

  it("says so when no other house is free for the stay", () => {
    renderList([house("a"), house("b")], [{ room_id: "b", check_in: "2026-12-20", check_out: "2026-12-22" }]);
    act(() => cart.setDates(stay));
    picked();
    expect(shownIds()).toEqual(["a"]);
    expect(container.textContent).toContain("noOtherHouses");
  });

  it("shows every house again once the dates are cleared", () => {
    renderList([house("a"), house("b")]);
    act(() => cart.setDates(stay));
    picked();
    expect(shownIds()).toEqual(["a"]);
    act(() => cart.setDates(undefined));
    expect(shownIds()).toEqual(["a", "b"]);
    expect(buttonsNamed("showOtherHouses")).toHaveLength(0);
  });

  it("shows the rest when the dialog's 'choose another house' asks for it", () => {
    renderList([house("a"), house("b")]);
    act(() => cart.setDates(stay));
    picked();
    choose("l1", "a");
    act(() => void document.dispatchEvent(new CustomEvent("house-chosen", { detail: { lineId: "l1", more: true } })));
    expect(shownIds()).toEqual(["a", "b"]);
  });
});

describe("a chosen house on its card", () => {
  it("shows its chosen line with edit and remove, the chosen tag and outline, and no second 'select'", () => {
    renderList([house("a")]);
    act(() => cart.setDates(stay));
    choose("l1", "a");
    const cardEl = container.querySelector('[data-room-id="a"]')!;
    expect(cardEl.className).toContain("ring-pine");
    expect(cardEl.textContent).toContain("chosen");
    expect(buttonsNamed("selectThisRoom")).toHaveLength(0);
    const edit = vi.fn();
    document.addEventListener("edit-line", edit);
    act(() => buttonsNamed("edit")[0].click());
    document.removeEventListener("edit-line", edit);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("asks before removing, in place, then frees the house", () => {
    renderList([house("a")]);
    act(() => cart.setDates(stay));
    choose("l1", "a");
    act(() => buttonsNamed("removeRoom")[0].click());
    expect(container.textContent).toContain("removeRoomConfirm");
    act(() => buttonsNamed("removeRoom")[0].click());
    expect(cart.lines).toHaveLength(0);
    expect(buttonsNamed("selectThisRoom")).toHaveLength(1);
  });

  it("offers one more unit while the house has units free", () => {
    renderList([house("a", { quantity: 3 })]);
    act(() => cart.setDates(stay));
    choose("l1", "a");
    expect(buttonsNamed("selectAnother")).toHaveLength(1);
  });
});

describe("chosen houses when the dates change", () => {
  it("drops a house the new dates leave unavailable, and names it", () => {
    renderList([house("a"), house("b")], [{ room_id: "a", check_in: "2026-12-26", check_out: "2026-12-27" }]);
    act(() => cart.setDates(stay));
    choose("l1", "a");
    choose("l2", "b");
    act(() => cart.setDates({ from: new Date(2026, 11, 25), to: new Date(2026, 11, 27) }));
    expect(cart.lines.map((l) => l.roomId)).toEqual(["b"]);
    expect(toast).toHaveBeenCalledWith("removedForDates:Baan a");
  });

  it("keeps as many units as are still free, and says how many", () => {
    renderList([house("a", { quantity: 2 })], [{ room_id: "a", check_in: "2026-12-26", check_out: "2026-12-27" }]);
    act(() => cart.setDates(stay));
    choose("l1", "a");
    choose("l2", "a");
    act(() => cart.setDates({ from: new Date(2026, 11, 25), to: new Date(2026, 11, 27) }));
    expect(cart.lines.map((l) => l.lineId)).toEqual(["l1"]);
    expect(toast).toHaveBeenCalledWith("trimmedForDates:Baan a,1");
  });

  it("leaves chosen houses alone while only a check-in is picked", () => {
    renderList([house("a")], [{ room_id: "a", check_in: "2026-12-26", check_out: "2026-12-27" }]);
    act(() => cart.setDates(stay));
    choose("l1", "a");
    act(() => cart.setDates({ from: new Date(2026, 11, 26), to: undefined }));
    expect(cart.lines).toHaveLength(1);
    expect(toast).not.toHaveBeenCalled();
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
