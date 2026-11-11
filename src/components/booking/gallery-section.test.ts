// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GallerySection } from "@/components/booking/gallery-section";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photos = (count: number) => Array.from({ length: count }, (_, i) => `/photo-${i + 1}.jpg`);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (images: string[]) => act(() => root.render(createElement(GallerySection, { images, name: "Baan" })));
const viewer = () => document.querySelector('[role="dialog"]');
const press = (key: string) =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

describe("GallerySection photo viewer", () => {
  it("opens as a labelled dialog that arrow keys page through and Escape closes", () => {
    render(photos(3));
    act(() => container.querySelector("button")!.click());

    expect(viewer()).not.toBeNull();
    const labels = [...viewer()!.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(expect.arrayContaining(["close", "prevPhoto", "nextPhoto"]));
    expect(viewer()!.textContent).toContain("1 / 3");

    press("ArrowRight");
    expect(viewer()!.textContent).toContain("2 / 3");

    press("Escape");
    expect(viewer()).toBeNull();
  });

  it("offers every photo from the fourth on, since phones show three tiles", () => {
    render(photos(5));
    const showAll = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("showAll"));
    expect(showAll?.textContent).toBe("showAll (5)");
  });

  it("shows a thumbnail strip in the viewer and jumps to the tapped photo", () => {
    render(photos(3));
    act(() => container.querySelector("button")!.click());
    const thumbs = [...viewer()!.querySelectorAll("button[aria-current]")] as HTMLButtonElement[];
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0].getAttribute("aria-current")).toBe("true");

    act(() => thumbs[2].click());
    expect(viewer()!.textContent).toContain("3 / 3");
  });
});
