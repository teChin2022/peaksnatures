// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cart = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
vi.mock("@/components/booking/booking-cart-context", () => ({ useBookingCartOptional: () => cart.value }));
vi.mock("@/components/booking/cart-line-list", () => ({ CartLineList: () => createElement("ul", { "data-testid": "lines" }) }));

import { HeaderCart } from "@/components/booking/header-cart";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  cart.value = { lines: [{}], subtotal: 1800, nights: 2, dateRange: { from: new Date(2026, 10, 20), to: new Date(2026, 10, 22) } };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("HeaderCart", () => {
  // The phone bar's cart tile and the toast both send open-cart; the dialog must open at any width.
  it("opens its cart dialog on open-cart, whatever the screen width", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    act(() => root.render(createElement(HeaderCart, { scrolled: true })));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    act(() => void document.dispatchEvent(new Event("open-cart")));
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("reviewCart");
    expect(dialog!.querySelector('[data-testid="lines"]')).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("writes the stay day first, as Thai dates read", () => {
    act(() => root.render(createElement(HeaderCart, { scrolled: true })));
    act(() => void document.dispatchEvent(new Event("open-cart")));
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain("20 Nov – 22 Nov 2026");
  });

  it("shows the count in red on the header button", () => {
    act(() => root.render(createElement(HeaderCart, { scrolled: true })));
    expect(container.querySelector("button span")?.className).toContain("bg-[#F83858]");
  });
});
