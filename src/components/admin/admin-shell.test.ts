// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: auth.signOut } }) }));

import { AdminShell, activeNavHref } from "./admin-shell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

const render = async () => {
  await act(async () => {
    root.render(createElement(AdminShell, null, createElement("p", null, "page")));
  });
};
const link = (href: string) => container.querySelector<HTMLAnchorElement>(`nav a[href="${href}"]`)!;

beforeEach(() => {
  nav.pathname = "/admin";
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ pendingHosts: 2, overdueInvoices: 0, unsettledPayments: 1, staleDateChanges: 0, guestAiRequests: 0 }),
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

describe("activeNavHref", () => {
  it("lights only the deepest matching item", () => {
    expect(activeNavHref("/admin/billing/rejected")).toBe("/admin/billing/rejected");
    expect(activeNavHref("/admin/billing")).toBe("/admin/billing");
    expect(activeNavHref("/admin/hosts/abc")).toBe("/admin/hosts");
    expect(activeNavHref("/admin")).toBe("/admin");
    expect(activeNavHref("/admin/billingx")).toBeUndefined();
  });
});

describe("AdminShell: work badges", () => {
  it("shows a count on items with work waiting, and names it for screen readers", async () => {
    await render();
    expect(link("/admin/hosts").textContent).toContain("2");
    expect(link("/admin/hosts").getAttribute("aria-label")).toBe("Hosts, 2 waiting for approval");
    expect(link("/admin/billing/rejected").getAttribute("aria-label")).toBe("Rejected payments, 1 to settle");
    // Nothing waiting: no badge, plain name.
    expect(link("/admin/billing").getAttribute("aria-label")).toBeNull();
  });

  it("puts the total on the phone menu button, so a closed drawer still shows waiting work", async () => {
    await render();
    const menu = container.querySelector<HTMLButtonElement>('button[aria-label^="Open menu"]')!;
    expect(menu.getAttribute("aria-label")).toBe("Open menu, 3 waiting");
    expect(menu.textContent).toBe("3");
  });

  it("refetches the counts when the page changes", async () => {
    await render();
    nav.pathname = "/admin/hosts";
    await render();
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/admin/nav-counts")).toHaveLength(2);
  });

  it("shows no badges when the counts fail to load", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await render();
    expect(link("/admin/hosts").getAttribute("aria-label")).toBeNull();
    expect(link("/admin/hosts").textContent).toBe("Hosts");
    expect(container.querySelector('button[aria-label="Open menu"]')).not.toBeNull();
  });
});

describe("AdminShell: sign out", () => {
  it("ends only this browser's session, not the admin's other devices", async () => {
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    await render();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Sign Out"));
    if (!button) throw new Error("no Sign Out button");
    await act(async () => button.click());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
