// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import DashboardHome from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROFILE = { id: "host-1", role: "owner", hasPhone: true, hasPromptpay: true, hasPinSet: true };

let container: HTMLDivElement;
let root: Root;

async function render(opts: { profileOk?: boolean; homestay?: unknown; bookingsError?: unknown }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: opts.profileOk ?? true, json: async () => PROFILE }));
  h.createClient.mockReturnValue(
    createSupabaseMock({
      user: { id: "owner-1" },
      tables: {
        homestays: { data: opts.homestay ?? null },
        rooms: { data: [] },
        bookings: { data: null, error: opts.bookingsError ?? null },
      },
    }),
  );
  await act(async () => root.render(createElement(DashboardHome)));
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// Failures used to look like data: a host could read "0 needs action" while
// their slips simply had not loaded.
describe("DashboardHome: when loading fails", () => {
  it("says the page did not load, instead of showing zeros, when the profile request fails", async () => {
    await render({ profileOk: false });
    expect(container.querySelector("[role=alert]")?.textContent).toContain("title");
    expect(container.textContent).not.toContain("todayWork");
  });

  it("says the page did not load when the bookings query fails", async () => {
    await render({ homestay: { id: "hs-1", name: "Doi", slug: "doi" }, bookingsError: { message: "boom" } });
    expect(container.querySelector("[role=alert]")).not.toBeNull();
    expect(container.textContent).not.toContain("todayWork");
  });

  it("points a host without a homestay to setting one up", async () => {
    await render({ homestay: null });
    expect(container.textContent).toContain("noHomestayTitle");
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/dashboard/homestay");
  });
});

// The profile route checks the session itself, so it does not wait for getUser().
describe("DashboardHome: loading", () => {
  it("asks for the profile without waiting for getUser()", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const client = createSupabaseMock({ user: { id: "owner-1" } });
    client.auth.getUser.mockReturnValue(new Promise(() => {}));
    h.createClient.mockReturnValue(client);
    await act(async () => root.render(createElement(DashboardHome)));
    expect(fetchMock).toHaveBeenCalledWith("/api/host/profile", expect.anything());
  });
});

describe("DashboardHome: what the stats read", () => {
  async function renderWith(bookings: { data?: unknown; count?: number }[]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => PROFILE }));
    const client = createSupabaseMock({
      user: { id: "owner-1" },
      tables: { homestays: { data: { id: "hs-1", name: "Doi", slug: "doi" } }, rooms: { data: [] }, bookings },
    });
    h.createClient.mockReturnValue(client);
    await act(async () => root.render(createElement(DashboardHome)));
    await act(async () => {});
    await act(async () => {});
    return client;
  }

  // Owner, 2026-11-20: the stats cover this month and the 11 before it (plus any ahead).
  // 30 Nov 18:00 UTC is already 1 Dec in Bangkok, so the window starts 1 Jan 2026, not 1 Dec 2025.
  it("reads only the last 12 months of check-ins, newest first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T18:00:00Z"));
    try {
      const client = await renderWith([{ data: [] }, { data: [] }, { count: 0 }]);
      const rows = client.builderFor("bookings", 0);
      expect(rows.gte).toHaveBeenCalledWith("check_in", "2026-01-01");
      expect(rows.order).toHaveBeenCalledWith("check_in", { ascending: false });
    } finally {
      vi.useRealTimers();
    }
  });

  // It must match the bookings page's Pending tab, which has no date window.
  it("counts every pending booking for Needs action, at any date", async () => {
    const client = await renderWith([{ data: [] }, { data: [] }, { count: 4 }]);
    const count = client.builderFor("bookings", 2);
    expect(count.in).toHaveBeenCalledWith("status", ["pending", "verified"]);
    expect(count.gte).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/dashboard/bookings?tab=pending"]')?.textContent).toContain("4");
  });
});
