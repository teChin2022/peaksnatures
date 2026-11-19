// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  isMobile: false,
  cart: null as unknown,
}));

// Keys and their values stand in for the copy: this tests what is shown, not its wording.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "th",
}));
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => h.isMobile }));
vi.mock("./use-booking-bar-visible", () => ({ useBookingBarVisible: () => false }));
vi.mock("./booking-cart-context", () => ({ useBookingCartOptional: () => h.cart }));
vi.mock("@marsidev/react-turnstile", () => ({ Turnstile: () => null }));

import { GuestAiAssistant, GuestAiEntryLink, openGuestAi } from "./guest-ai-assistant";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOMS = [
  { id: "r1", name: "บ้าน A", max_guests: 2, is_active: true, price_per_night: 1200 },
  { id: "r2", name: "บ้าน B", max_guests: 5, is_active: true, price_per_night: 2500 },
];

/** A stand-in cart: setDates swaps in a new cart with those dates, as the real provider re-renders. */
function makeCart(range?: { from: Date; to: Date }, busy: string[] = [], lines: unknown[] = []) {
  const cart = {
    dateRange: range,
    lines,
    nights: range ? Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) : 0,
    catalog: { rooms: ROOMS, seasonalPrices: [], specialPrices: [] },
    isRoomAvailableForRange: (r: { id: string }) => !!range && !busy.includes(r.id),
    setDates: vi.fn((next: { from: Date; to: Date }) => {
      h.cart = makeCart(next, busy, lines);
    }),
  };
  return cart;
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let picked: unknown[];
const onPicked = (e: Event) => picked.push((e as CustomEvent).detail);

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const refused = (status: number, code: string) => ({ ok: false, status, json: async () => ({ code }) });
const reply = (over: Record<string, unknown> = {}) => ({ reply: "ตอบแล้วค่ะ", answered: true, intent: null, action: null, ...over });

let contact: { lineId: string | null; phone: string | null } = { lineId: "monngo", phone: "099-000-1234" };
async function render(enabled = true) {
  await act(async () => root.render(createElement(GuestAiAssistant, { slug: "ing", guestAiEnabled: enabled, contact })));
}
/** The provider re-rendering with the cart setDates left behind. */
const rerender = () => render();

const text = () => document.body.textContent ?? "";
const byText = (label: string) =>
  [...document.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === label) as HTMLElement | undefined;
async function ask(question: string) {
  const input = document.querySelector("input[type=text]") as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, question);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.form!.requestSubmit());
  await act(async () => {});
}
const bodyOf = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);

beforeEach(() => {
  contact = { lineId: "monngo", phone: "099-000-1234" };
  h.isMobile = false;
  h.cart = makeCart();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  picked = [];
  document.addEventListener("dates-picked", onPicked);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  document.body.style.paddingRight = "";
  vi.unstubAllGlobals();
  document.removeEventListener("dates-picked", onPicked);
});

describe("GuestAiAssistant", () => {
  it("renders nothing when the host has no assistant", async () => {
    await render(false);
    expect(document.body.innerHTML).toBe("<div></div>");
    // The link stays in the HTML (no shift after hydration), hidden by its attribute.
    await act(async () => root.render(createElement(GuestAiEntryLink, { guestAiEnabled: false })));
    expect(container.querySelector("[data-guest-ai]")?.getAttribute("data-guest-ai")).toBe("off");
    expect(container.querySelector("[data-guest-ai]")?.className).toContain("data-[guest-ai=off]:hidden");
  });

  it("sets the stay the guest asked for on the page and shows its first free house, as Done does", async () => {
    h.cart = makeCart(undefined, ["r1"]);
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(
      ok(reply({ intent: { check_in: "2026-11-28", check_out: "2026-11-29", guests: 4, room_ids: ["r1"] } })),
    );
    await ask("เสาร์อาทิตย์หน้า 4 คน");

    // The first question has no session: it carries a Turnstile token (no site key in tests).
    expect(bodyOf(0)).toEqual({ slug: "ing", question: "เสาร์อาทิตย์หน้า 4 คน", locale: "th", history: [], turnstileToken: "no-site-key" });
    const cart = h.cart as ReturnType<typeof makeCart>;
    expect(cart.dateRange).toEqual({ from: new Date(2026, 10, 28), to: new Date(2026, 10, 29) });

    await rerender();
    // r1 was asked for but is booked; r2 is free and sleeps 4.
    expect(picked).toEqual([{ roomId: "r2" }]);
    expect(text()).toContain("someFree:1,2");
    expect(text()).toContain("fitSome:4,บ้าน B");
    expect(byText("seeHouses")).toBeDefined();
  });

  it("drops the availability notes once the guest picks other dates", async () => {
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(ok(reply({ intent: { check_in: "2026-11-28", check_out: "2026-11-29", guests: null, room_ids: [] } })));
    await ask("เสาร์หน้า");
    await rerender();
    expect(text()).toContain("allFree");

    h.cart = makeCart({ from: new Date(2026, 11, 5), to: new Date(2026, 11, 6) });
    await rerender();
    expect(text()).not.toContain("allFree");
    expect(text()).toContain("ตอบแล้วค่ะ");
  });

  it("goes through Turnstile again when the session ran out, then asks once more", async () => {
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(ok(reply()));
    await ask("มีที่จอดรถไหม");
    expect(bodyOf(0).turnstileToken).toBe("no-site-key");

    fetchMock.mockResolvedValueOnce(refused(401, "verify")).mockResolvedValueOnce(ok(reply({ reply: "ตอบรอบสอง" })));
    await ask("เช็คอินกี่โมง");
    // The session was good for the second question: no token. The retry carries one.
    expect(bodyOf(1).turnstileToken).toBeUndefined();
    expect(bodyOf(2).turnstileToken).toBe("no-site-key");
    expect(bodyOf(2).history).toEqual([{ q: "มีที่จอดรถไหม", a: "ตอบแล้วค่ะ" }]);
    expect(text()).toContain("ตอบรอบสอง");
  });

  it.each([
    [429, "limit", "errorLimit", "contactLine"],
    [503, "unavailable", "errorUnavailable", "contactPhone"],
    [502, "failed", "errorFailed", "retry"],
  ])("says what happened on %i %s, with a way on", async (status, code, message, next) => {
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(refused(status, code));
    await ask("คำถาม");
    expect(text()).toContain(message);
    expect(byText(next)).toBeDefined();
  });

  it("shows the reply as plain text, never as HTML (F-03)", async () => {
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(ok(reply({ reply: '<a href="https://evil.example">ส่วนลด</a>' })));
    await ask("โปร");
    expect(document.querySelector('a[href="https://evil.example"]')).toBeNull();
    expect(text()).toContain('<a href="https://evil.example">ส่วนลด</a>');
  });

  it("links the pages the host allows, built from the slug", async () => {
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(ok(reply({ action: "change_booking" })));
    await ask("เลื่อนวัน");
    expect(byText("goChangeBooking")?.getAttribute("href")).toBe("/ing/change-booking");
  });

  it("on desktop takes its width from the page from 1024px, and gives it back on close", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    await render();
    await act(async () => byText("title")!.click());
    expect(document.body.style.paddingRight).toBe("380px");
    expect(document.querySelector("aside")).not.toBeNull();
    const launcher = byText("title") as HTMLButtonElement;
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    await act(async () => (document.querySelector('button[aria-label="close"]') as HTMLElement).click());
    expect(document.body.style.paddingRight).toBe("");
    // Focus goes back to the button that opened it (critique 2026-11-19, P1), not to <body>.
    expect(document.activeElement).toBe(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
  });

  it("offers a stay instead of replacing one the guest built with houses chosen", async () => {
    h.cart = makeCart({ from: new Date(2026, 11, 5), to: new Date(2026, 11, 6) }, [], [{ lineId: "l1" }]);
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(ok(reply({ intent: { check_in: "2026-11-28", check_out: "2026-11-29", guests: null, room_ids: [] } })));
    await ask("เสาร์หน้าว่างไหม");

    const cart = h.cart as ReturnType<typeof makeCart>;
    expect(cart.setDates).not.toHaveBeenCalled();
    expect(text()).toContain("proposeDates");
    await act(async () => byText("useTheseDates")!.click());
    expect(cart.setDates).toHaveBeenCalledWith({ from: new Date(2026, 10, 28), to: new Date(2026, 10, 29) });
    await rerender();
    expect(text()).not.toContain("proposeDates");
    expect(text()).toContain("allFree");
  });

  it("suggests the free houses it was asked about, priced for the stay, and hands the choice to the page", async () => {
    h.cart = makeCart(undefined, ["r1"]);
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(
      ok(reply({ intent: { check_in: "2026-11-28", check_out: "2026-11-30", guests: 2, room_ids: ["r1", "r2"] } })),
    );
    await ask("เสาร์อาทิตย์หน้า");
    await rerender();

    // r1 is booked for those nights: only r2, at its own nightly rate x 2 nights.
    const list = document.querySelector('ul[aria-label="suggestTitle"]')!;
    expect(list.querySelectorAll("li")).toHaveLength(1);
    expect(list.textContent).toContain("บ้าน B");
    expect(list.textContent).toContain("suggestMeta:5,5,000,2");
    // The suggestion is the primary action; "see free houses" steps back.
    expect(byText("seeHouses")?.className).toContain("border-line-strong");

    const chosen: unknown[] = [];
    const onChoose = (e: Event) => chosen.push((e as CustomEvent).detail);
    document.addEventListener("choose-house", onChoose);
    await act(async () => (list.querySelector("button") as HTMLElement).click());
    // Sent on the next tick, once the panel is gone.
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    document.removeEventListener("choose-house", onChoose);
    expect(chosen).toEqual([{ roomId: "r2" }]);
    // The panel closes so the page's own dialog has the stage.
    expect(document.querySelector("aside")).toBeNull();
  });

  it("hands over to the host's own LINE and phone, and to the footer when there are none", async () => {
    await render();
    await act(async () => byText("title")!.click());
    fetchMock.mockResolvedValueOnce(ok(reply({ answered: false, action: "contact" })));
    await ask("มีสระไหม");
    expect(byText("contactLine")?.getAttribute("href")).toBe("https://line.me/ti/p/~monngo");
    expect(byText("contactPhone")?.getAttribute("href")).toBe("tel:0990001234");

    contact = { lineId: null, phone: null };
    await rerender();
    expect(byText("contactLine")).toBeUndefined();
    expect(byText("goContact")).toBeDefined();
  });

  it("on phones opens a sheet from the bar's event", async () => {
    h.isMobile = true;
    await render();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => openGuestAi());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("title");
  });
});
