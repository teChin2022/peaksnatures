// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullScreenMenu } from "@/components/full-screen-menu";
import { withIntl } from "../../test/helpers/intl";

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
  const section = document.createElement("section");
  section.id = "houses";
  document.body.append(section);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.getElementById("houses")?.remove();
  vi.useRealTimers();
});

async function tapSectionLink() {
  act(() =>
    root.render(
      withIntl(
        createElement(FullScreenMenu, {
          open: true,
          onOpenChange: () => {},
          title: "Menu",
          items: [{ label: "Houses", href: "#houses" }],
        }),
      ),
    ),
  );
  const link = document.body.querySelector<HTMLAnchorElement>('a[href="#houses"]')!;
  await act(async () => link.click());
  await act(async () => vi.advanceTimersByTime(200));
}

describe("FullScreenMenu section links", () => {
  it("scroll smoothly by default", async () => {
    mockReducedMotion(false);
    await tapSectionLink();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  // design-direction §7: reduced motion everywhere. Used by / and /[slug].
  it("jump without animation when the visitor asks for reduced motion", async () => {
    mockReducedMotion(true);
    await tapSectionLink();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});
