// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp, RevealScope } from "@/components/booking/reveal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A controllable IntersectionObserver: tests decide when an element scrolls in.
let observed: Element[] = [];
let fire: (target: Element) => void = () => {};
class FakeObserver {
  constructor(private callback: IntersectionObserverCallback) {
    fire = (target) => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  observe(el: Element) {
    observed.push(el);
  }
  unobserve(el: Element) {
    observed = observed.filter((x) => x !== el);
  }
  disconnect() {
    observed = [];
  }
}

const rect = (top: number, height = 100) => () => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

let container: HTMLDivElement;
let root: Root;
let reduce = false;

beforeEach(() => {
  observed = [];
  reduce = false;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Renders a scope with one photo at `top` px from the viewport's top. */
function renderScope(top: number) {
  const proto = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = rect(top);
  act(() => root.render(createElement(RevealScope, null, createElement("div", { "data-reveal-kind": "unveil", id: "photo" }))));
  HTMLElement.prototype.getBoundingClientRect = proto;
  return container.querySelector<HTMLElement>("#photo")!;
}

describe("RevealScope", () => {
  it("holds a photo below the fold back, then lets it in once it scrolls into view", () => {
    const photo = renderScope(window.innerHeight + 200);
    expect(photo.dataset.reveal).toBe("pending");
    act(() => fire(photo));
    expect(photo.dataset.reveal).toBe("in");
    expect(observed).not.toContain(photo);
  });

  it("leaves a photo already on screen at load alone, so it never blinks", () => {
    const photo = renderScope(100);
    expect(photo.dataset.reveal).toBeUndefined();
  });

  it("does nothing under reduced motion", () => {
    reduce = true;
    const photo = renderScope(window.innerHeight + 200);
    expect(photo.dataset.reveal).toBeUndefined();
    expect(observed).toHaveLength(0);
  });
});

describe("CountUp", () => {
  it("writes the real figure into the server HTML, so no visitor ever reads a zero", () => {
    expect(renderToStaticMarkup(createElement(CountUp, { value: 4.9 }))).toContain(">4.9<");
    expect(renderToStaticMarkup(createElement(CountUp, { value: 1250 }))).toContain(">1,250<");
  });

  it("starts a figure below the fold from zero, in the value's own decimals", () => {
    const proto = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = rect(window.innerHeight + 200);
    act(() => root.render(createElement(CountUp, { value: 4.9 })));
    HTMLElement.prototype.getBoundingClientRect = proto;
    expect(container.textContent).toBe("0.0");
  });

  it("keeps the real figure under reduced motion", () => {
    reduce = true;
    const proto = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = rect(window.innerHeight + 200);
    act(() => root.render(createElement(CountUp, { value: 126 })));
    HTMLElement.prototype.getBoundingClientRect = proto;
    expect(container.textContent).toBe("126");
  });
});
