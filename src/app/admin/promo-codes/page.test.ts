// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminPromoCodesPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const code = {
  id: "pc-1",
  code: "SPRING10",
  discount_type: "percentage",
  discount_value: 10,
  is_active: true,
  recommender_name: null,
  times_used: 2,
  max_uses: 5,
  start_at: null,
  expires_at: null,
  homestay: { id: "hs-1", name: "Cozy Villa", slug: "cozy-villa", host: { id: "h-1", name: "Wang" } },
};

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminPromoCodesPage));
  });
};

beforeEach(() => {
  fetchMock.mockReset();
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

describe("Admin promo codes", () => {
  it("lists codes in a table", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ data: String(url).includes("promo-codes") ? [code] : [], hasMore: false }),
    }));
    await render();
    const row = container.querySelector("tbody tr");
    expect(row?.textContent).toContain("SPRING10");
    expect(row?.textContent).toContain("2 / 5");
  });

  // The route's error body used to be read as an empty list: "No promo codes yet".
  it("says it could not load instead of showing an empty list, and retries", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Failed" }) });
    await render();
    expect(container.textContent).toContain("Couldn't load promo codes");
    expect(container.textContent).not.toContain("No promo codes yet");

    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ data: String(url).includes("promo-codes") ? [code] : [], hasMore: false }),
    }));
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Try again")!;
    await act(async () => retry.click());
    expect(container.textContent).toContain("SPRING10");
  });
});
