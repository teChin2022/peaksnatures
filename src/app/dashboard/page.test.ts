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
