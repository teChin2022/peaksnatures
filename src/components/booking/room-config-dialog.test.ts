// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Room, RoomGuestPricing } from "@/types/database";
import { BookingCartProvider, useBookingCart, type BookingCartValue, type CartLine } from "@/components/booking/booking-cart-context";
import { RoomConfigDialog } from "@/components/booking/room-config-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
  useLocale: () => "th",
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tier = (id: string, adults: number, surcharge: number, sort_order: number) =>
  ({ id, room_id: "r1", adults, children: 0, detail: null, surcharge, sort_order }) as unknown as RoomGuestPricing;
const room = { id: "r1", name: "Baan Mok", price_per_night: 1500, max_guests: 4, quantity: 2, images: [], is_active: true } as unknown as Room;
const catalog = {
  rooms: [room],
  seasonalPrices: [],
  specialPrices: [],
  roomOptions: [],
  guestPricing: [tier("t2", 2, 0, 0), tier("t3", 3, 500, 1)],
  blockedDates: [],
  bookedRanges: [],
};

// The real chosen-houses state: what the dialog adds is what the checkout later reads.
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

let container: HTMLDivElement;
let root: Root;
let onClose = vi.fn();

const render = (editingLine: CartLine | null = null) =>
  act(() =>
    root.render(
      createElement(
        BookingCartProvider,
        providerProps({ catalog, homestayId: "h1" }),
        createElement(Probe, { onCart: keepCart }),
        // Keyed per edited line, as every call site does, so its initial state applies.
        createElement(RoomConfigDialog, { key: editingLine?.lineId ?? room.id, room, open: true, onClose, editingLine }),
      ),
    ),
  );

beforeEach(() => {
  // The provider refreshes availability on mount; never answering keeps the catalog's.
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onClose = vi.fn();
  render();
  act(() => cart.setDates({ from: new Date(2026, 10, 18), to: new Date(2026, 10, 20) }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const tierButtons = () => [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
const button = (text: string) => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
const nextTask = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const line = (lineId: string): CartLine => ({ lineId, roomId: "r1", numGuests: 2, tierIds: ["t2"], optionIds: [] });

describe("RoomConfigDialog guest tiers and total", () => {
  it("starts on the host's normal-price tier, and says which tier is chosen", () => {
    expect(tierButtons()).toHaveLength(2);
    expect(tierButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    act(() => tierButtons()[1].click());
    expect(tierButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("starts on the normal-price tier even when it is not listed first", () => {
    const saved = catalog.guestPricing;
    catalog.guestPricing = [tier("t3", 3, 500, 0), tier("t2", 2, 0, 1)];
    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(tierButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    catalog.guestPricing = saved;
  });

  it("keeps an edited house's own tier instead of the default", () => {
    act(() => cart.addLine({ lineId: "l3", roomId: "r1", numGuests: 3, tierIds: ["t3"], optionIds: [] }));
    render(cart.lines[0]);
    expect(tierButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("puts the dates and nights beside the total once a tier is chosen", () => {
    act(() => tierButtons()[0].click());
    expect(document.body.textContent).toContain("18 พ.ย. – 20 พ.ย. · 2 nights");
  });
});

describe("RoomConfigDialog without a cart", () => {
  it("offers Book Now and Choose another house, both ready at once: the normal-price tier is chosen for the guest", () => {
    expect(button("bookNow")?.disabled).toBe(false);
    expect(button("chooseAnotherHouse")?.disabled).toBe(false);
  });

  // The checkout's handler reads the chosen houses: sent in the same task, it would find none.
  it("Book Now chooses the house, closes, and starts checkout once the house is chosen", async () => {
    const seen: number[] = [];
    const proceed = () => seen.push(cart.lines.length);
    document.addEventListener("proceed-booking", proceed);
    act(() => tierButtons()[0].click());
    act(() => button("bookNow")!.click());
    await nextTask();
    document.removeEventListener("proceed-booking", proceed);
    expect(seen).toEqual([1]);
    expect(cart.lines[0]).toMatchObject({ roomId: "r1", tierIds: ["t2"] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Choose another house keeps the house chosen, confirms it, and asks the list for the rest, without checkout", async () => {
    const proceed = vi.fn();
    const chosen = vi.fn();
    const onChosen = (e: Event) => chosen((e as CustomEvent).detail);
    document.addEventListener("proceed-booking", proceed);
    document.addEventListener("house-chosen", onChosen);
    act(() => tierButtons()[0].click());
    act(() => button("chooseAnotherHouse")!.click());
    await nextTask();
    document.removeEventListener("proceed-booking", proceed);
    document.removeEventListener("house-chosen", onChosen);
    expect(cart.lines).toHaveLength(1);
    expect(chosen).toHaveBeenCalledWith({ lineId: cart.lines[0].lineId, more: true });
    expect(toast.success).toHaveBeenCalledWith("addedToast:Baan Mok");
    expect(proceed).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("with another house chosen, prices this one as 'this house', adds the grand total, and Book Now counts both", () => {
    act(() => cart.addLine(line("other")));
    act(() => tierButtons()[0].click());
    expect(document.body.textContent).toContain("thisHouse");
    expect(document.body.textContent).toContain("allHousesTotal:2");
    expect(document.body.textContent).toContain("฿6,000");
    expect(button("bookNowCount:2")).toBeDefined();
  });

  it("editing a chosen house has one Save button and no grand total", () => {
    act(() => cart.addLine(line("l1")));
    render(cart.lines[0]);
    expect(button("save")).toBeDefined();
    expect(button("bookNow")).toBeUndefined();
    expect(button("chooseAnotherHouse")).toBeUndefined();
    expect(document.body.textContent).not.toContain("allHousesTotal");
  });
});
