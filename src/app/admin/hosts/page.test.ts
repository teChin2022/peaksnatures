// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => nav,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import AdminHostsPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const host = {
  id: "host-1",
  user_id: "user-1",
  name: "Wang",
  email: "wang@example.com",
  phone: null,
  status: "approved",
  is_verified: true,
  created_at: "2026-11-01T03:00:00Z",
  plan_type: "commission",
  wallet_balance: 500,
  plan_free_expires_at: null,
  commission_pct_override: null,
  quick_commission_pct_override: null,
  fixed_rate_override: null,
  fixed_rate_term_months: null,
  fixed_rate_term_ends_at: null,
  homestay: { name: "Cozy Villa", slug: "cozy-villa", is_active: true },
  blocked: false,
};

const writes = () =>
  fetchMock.mock.calls.filter(([, init]) => ["PATCH", "POST"].includes((init as RequestInit | undefined)?.method ?? ""));
const button = (text: string, scope: ParentNode = document.body) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminHostsPage));
  });
};

beforeEach(() => {
  nav.query = "";
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return { ok: true, json: async () => ({ is_verified: false }) };
    if (init?.method === "POST") return { ok: true, json: async () => ({}) };
    if (String(url).startsWith("/api/admin/billing-config")) return { ok: true, json: async () => null };
    return { ok: true, json: async () => ({ data: [host], total: 1, page: 1, limit: 20, totalPages: 1 }) };
  });
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

describe("Admin hosts: removing verification", () => {
  it("asks first, and only then calls the verify route", async () => {
    await render();

    await act(async () => button("Unverify", container)!.click());
    expect(writes()).toHaveLength(0);
    expect(document.body.textContent).toContain("Guests stop seeing it on their booking page.");

    await act(async () => button("Remove verification")!.click());
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0][0])).toBe("/api/admin/hosts/host-1/verify");
  });
});

describe("Admin hosts: the phone Manage sheet", () => {
  it("holds the row's actions, and a tap closes it and opens that action's dialog", async () => {
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Manage Wang"]')!.click());

    const sheet = document.body.querySelector('[data-slot="sheet-content"]')!;
    expect(sheet.textContent).toContain("Commission · wallet ฿500");
    expect(["Unverify", "Plan", "Rate", "Adjust"].map((t) => !!button(t, sheet))).toEqual([true, true, true, true]);

    await act(async () => button("Adjust", sheet)!.click());
    expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expect(document.body.textContent).toContain("Wallet Adjustment");
    expect(writes()).toHaveLength(0);
  });
});

describe("Admin hosts: wallet adjustment", () => {
  it("sends a deduction as a negative amount and previews the balance it leaves", async () => {
    await render();
    await act(async () => button("Adjust", container)!.click());

    await act(async () => button("Deduct")!.click());
    await type(document.querySelector<HTMLInputElement>("#wallet-amount")!, "200");
    await type(document.querySelector<HTMLInputElement>("#wallet-reason")!, "Refund of duplicate charge");

    expect(document.querySelector("#wallet-preview")?.textContent).toBe("Balance ฿500 → ฿300");

    await act(async () => button("Deduct from wallet")!.click());
    expect(writes()).toHaveLength(1);
    const [url, init] = writes()[0];
    expect(String(url)).toBe("/api/admin/hosts/host-1/wallet");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ amount: -200, reason: "Refund of duplicate charge" });
  });

  it("keeps the save disabled until the amount is a whole number above zero", async () => {
    await render();
    await act(async () => button("Adjust", container)!.click());
    await type(document.querySelector<HTMLInputElement>("#wallet-reason")!, "Credit");

    await type(document.querySelector<HTMLInputElement>("#wallet-amount")!, "12.5");
    expect(button("Add to wallet")!.disabled).toBe(true);

    await type(document.querySelector<HTMLInputElement>("#wallet-amount")!, "300");
    expect(button("Add to wallet")!.disabled).toBe(false);
    expect(document.querySelector("#wallet-preview")?.textContent).toBe("Balance ฿500 → ฿800");
  });
});

describe("Admin hosts: a list that fails to load", () => {
  it("says it could not load, not that there are no hosts, and retries", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/admin/hosts") ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => null },
    );
    await render();

    expect(container.textContent).toContain("Couldn't load hosts");
    expect(container.textContent).not.toContain("No hosts found");

    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/admin/hosts")
        ? { ok: true, json: async () => ({ data: [host], total: 1, page: 1, limit: 20, totalPages: 1 }) }
        : { ok: true, json: async () => null },
    );
    await act(async () => button("Try again", container)!.click());
    expect(container.textContent).toContain("Wang");
    expect(container.textContent).not.toContain("Couldn't load hosts");
  });
});
