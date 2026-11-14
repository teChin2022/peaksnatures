// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AboutSection } from "@/components/booking/about-section";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom does no layout; the description's cut is covered in expandable-text.test.ts.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

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

const amenities = (count: number) => Array.from({ length: count }, (_, i) => `Amenity ${i + 1}`);
const render = (list: string[]) =>
  act(() => root.render(createElement(AboutSection, { description: "<p>Hello</p>", amenities: list, maxGuests: 4 })));
const showAll = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "showAll");

describe("AboutSection amenities", () => {
  it("offers the whole list once phones would cut it, past six", () => {
    render(amenities(8));
    expect(showAll()).toBeDefined();
  });

  it("needs no 'show all' for a short list", () => {
    render(amenities(6));
    expect(showAll()).toBeUndefined();
  });

  it("opens every amenity in a dialog", () => {
    render(amenities(8));
    act(() => showAll()!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Amenity 8");
  });
});
