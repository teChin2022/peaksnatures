// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  // Stable like Next's router, so the fetch effect does not re-run on every render.
  useRouter: () => nav,
}));

import AdminLogsPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminLogsPage));
  });
};
const fetchedUrls = () => fetchMock.mock.calls.map(([u]) => String(u));
const byText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

beforeEach(() => {
  nav.query = "";
  nav.replace.mockReset();
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], hasMore: false, nextCursor: null }),
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Admin logs: filters from the URL", () => {
  // Overview's "Needs attention" links here; the filter must be visible, not hidden in a closed panel.
  it("shows the filter it arrived with and queries by it", async () => {
    nav.query = "event_type=PLATFORM_PAYMENT_REJECTED";
    await render();

    expect(container.querySelector('[aria-label="Active filters"]')?.textContent).toContain(
      "Event:PLATFORM_PAYMENT_REJECTED",
    );
    expect(fetchedUrls().at(-1)).toContain("event_type=PLATFORM_PAYMENT_REJECTED");
  });

  it("removes one filter from its chip", async () => {
    nav.query = "event_type=PLATFORM_PAYMENT_REJECTED&actor_type=admin";
    await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Remove event filter"]')!.click();
    });

    expect(container.querySelector('[aria-label="Active filters"]')?.textContent).not.toContain("Event:");
    expect(fetchedUrls().at(-1)).not.toContain("event_type");
    expect(fetchedUrls().at(-1)).toContain("actor_type=admin");
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/logs?actor_type=admin", { scroll: false });
  });

  it("offers to clear the filters when nothing matches", async () => {
    nav.query = "event_type=PLATFORM_PAYMENT_REJECTED";
    await render();

    await act(async () => {
      byText("Clear filters")!.click();
    });

    expect(container.querySelector('[aria-label="Active filters"]')).toBeNull();
    expect(fetchedUrls().at(-1)).not.toContain("event_type");
    // A reload must not bring the filter back.
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/logs", { scroll: false });
  });

  it("shows no chips without filters", async () => {
    await render();
    expect(container.querySelector('[aria-label="Active filters"]')).toBeNull();
    expect(byText("Clear filters")).toBeUndefined();
  });
});
