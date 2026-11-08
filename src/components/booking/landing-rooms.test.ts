// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingRooms, type LandingRoom } from "@/components/booking/landing-rooms";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom does no layout; the description's cut is covered in expandable-text.test.ts.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

const ROOM: LandingRoom = {
  id: "room-1",
  name: "บ้านริมธาร",
  description: "<p>ตื่นมากับทะเลหมอก</p>",
  price_per_night: 1500,
  max_guests: 2,
  images: [],
  is_active: true,
};

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

describe("LandingRooms", () => {
  it("shows each house with its description and standard rate", () => {
    act(() => root.render(createElement(LandingRooms, { rooms: [ROOM] })));
    expect(container.textContent).toContain("บ้านริมธาร");
    expect(container.textContent).toContain("ตื่นมากับทะเลหมอก");
    expect(container.textContent).toContain("฿1,500");
  });

  it("renders nothing without houses", () => {
    act(() => root.render(createElement(LandingRooms, { rooms: [] })));
    expect(container.innerHTML).toBe("");
  });
});
