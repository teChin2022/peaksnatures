// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import AdminHomestaysPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const homestay = (is_active: boolean) => ({
  id: "hs-1",
  host_id: "host-1",
  name: "Cozy Villa",
  slug: "cozy-villa",
  location: "Chiang Mai",
  is_active,
  created_at: "2026-11-01T03:00:00Z",
  host: { name: "Wang", email: "wang@example.com" },
});

function listReturns(isActive: boolean) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return { ok: true, json: async () => ({ is_active: !isActive }) };
    return { ok: true, json: async () => ({ data: [homestay(isActive)], total: 1, page: 1, limit: 20, totalPages: 1 }) };
  });
}

const patches = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
const switchEl = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
const bodyButton = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminHomestaysPage));
  });
};

beforeEach(() => {
  fetchMock.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
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

describe("Admin homestays: the on/off switch", () => {
  it("names the switch for screen readers", async () => {
    listReturns(true);
    await render();
    expect(switchEl().getAttribute("aria-label")).toBe("Cozy Villa booking site online");
  });

  it("asks before taking a live homestay offline, and only then calls the route", async () => {
    listReturns(true);
    await render();

    await act(async () => switchEl().click());
    expect(patches()).toHaveLength(0);
    expect(document.body.textContent).toContain("Take homestay offline");

    await act(async () => bodyButton("Take offline")!.click());
    expect(patches()).toHaveLength(1);
    expect(String(patches()[0][0])).toBe("/api/admin/homestays/hs-1/toggle");
    expect(toast.success).toHaveBeenCalledWith("Homestay is offline");
  });

  it("does nothing when the admin cancels", async () => {
    listReturns(true);
    await render();

    await act(async () => switchEl().click());
    await act(async () => bodyButton("Cancel")!.click());
    expect(patches()).toHaveLength(0);
  });

  it("puts an offline homestay back online in one click", async () => {
    listReturns(false);
    await render();

    await act(async () => switchEl().click());
    expect(patches()).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Take homestay offline");
  });

  it("says so when the route fails, instead of failing silently", async () => {
    listReturns(false);
    await render();
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({ error: "Failed to update" }) }));

    await act(async () => switchEl().click());
    expect(toast.error).toHaveBeenCalledWith("Couldn't change the homestay. Reload the page and try again.");
    expect(switchEl().getAttribute("aria-checked")).toBe("false");
  });
});
