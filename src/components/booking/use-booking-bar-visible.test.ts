// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBookingBarVisible } from "@/components/booking/use-booking-bar-visible";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Tests say when the footer or the date panel scrolls in.
const watchers = new Map<Element, (inView: boolean) => void>();
class FakeObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(el: Element) {
    watchers.set(el, (inView) => this.callback([{ target: el, isIntersecting: inView } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
  }
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;
let root: Root;
function Probe({ enabled }: { enabled: boolean }) {
  return createElement("output", null, String(useBookingBarVisible(enabled)));
}
const shown = () => container.querySelector("output")?.textContent === "true";

beforeEach(() => {
  watchers.clear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  document.body.innerHTML = '<div id="date-panel"></div><footer></footer>';
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const render = (enabled = true) => act(() => root.render(createElement(Probe, { enabled })));
const scroll = (selector: string, inView: boolean) => act(() => watchers.get(document.querySelector(selector)!)!(inView));
const send = (name: string, detail: unknown) => act(() => void document.dispatchEvent(new CustomEvent(name, { detail })));

describe("useBookingBarVisible", () => {
  it("hides while the date panel is on screen and shows once it scrolls away", () => {
    render();
    scroll("#date-panel", true);
    expect(shown()).toBe(false);
    scroll("#date-panel", false);
    expect(shown()).toBe(true);
  });

  it("follows the booking card, the checkout step and the footer", () => {
    render();
    send("booking-card-view", { inView: true });
    expect(shown()).toBe(false);
    send("booking-card-view", { inView: false });
    send("booking-step", { step: "details" });
    expect(shown()).toBe(false);
    send("booking-step", { step: "dates" });
    scroll("footer", true);
    expect(shown()).toBe(false);
  });

  it("stays hidden, and watches nothing, when disabled", () => {
    render(false);
    expect(shown()).toBe(false);
    expect(watchers.size).toBe(0);
  });
});
