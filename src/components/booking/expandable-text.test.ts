// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandableText } from "@/components/booking/expandable-text";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom does no layout: each test sets the sizes and fires the observer itself.
let fireResize = () => {};
class FakeResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    fireResize = () => this.callback([], this as unknown as ResizeObserver);
  }
  disconnect() {
    fireResize = () => {};
  }
}

function layout(scrollHeight: number, clientHeight: number) {
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight);
  act(() => fireResize());
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(createElement(ExpandableText, { html: "<p>ตื่นมากับทะเลหมอก</p>", clampClassName: "line-clamp-4" })),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const toggle = () => container.querySelector("button");
const clamped = () => container.querySelector(".line-clamp-4") !== null;

describe("ExpandableText", () => {
  it("shows the text, with no toggle while it fits", () => {
    layout(96, 96);
    expect(container.textContent).toContain("ตื่นมากับทะเลหมอก");
    expect(toggle()).toBeNull();
  });

  it("opens the rest in place once the text is cut, with no dialog", () => {
    layout(200, 96);
    expect(toggle()?.textContent).toBe("readMore");
    act(() => toggle()!.click());
    expect(clamped()).toBe(false);
    expect(toggle()?.textContent).toBe("showLess");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the toggle while open, though nothing overflows then, and closes again", () => {
    layout(200, 96);
    act(() => toggle()!.click());
    layout(200, 200);
    expect(toggle()?.textContent).toBe("showLess");
    act(() => toggle()!.click());
    expect(clamped()).toBe(true);
    expect(toggle()?.textContent).toBe("readMore");
  });
});
