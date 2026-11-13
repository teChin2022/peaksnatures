// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomLightbox } from "@/components/booking/rooms-section";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));

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
});
