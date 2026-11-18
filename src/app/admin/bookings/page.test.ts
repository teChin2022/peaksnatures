// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminBookingsPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const bookingUrls = () =>
  fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/admin/bookings?"));

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminBookingsPage));
  });
};

beforeEach(() => {
  nav.query = "";
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ data: [], total: 0, hasMore: false }) });
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

describe("Admin bookings: filters", () => {
  // Overview's "Pending bookings" total links here.
  it("starts filtered by the status in the URL", async () => {
    nav.query = "status=pending";
    await render();
    expect(bookingUrls().at(-1)).toContain("status=pending");
  });

  it("ignores a status in the URL that is not one", async () => {
    nav.query = "status=paid";
    await render();
    expect(bookingUrls().at(-1)).not.toContain("status=");
  });

  it("searches by what the admin typed when the search is submitted", async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "0812345678");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(bookingUrls().at(-1)).not.toContain("q=");

    await act(async () => {
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(bookingUrls().at(-1)).toContain("q=0812345678");
    expect(container.textContent).toContain("No matching bookings");
  });
});
