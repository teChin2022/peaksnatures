// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn(), pathname: "/dashboard" }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: h.createClient }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import { DashboardShell } from "./dashboard-shell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

async function render(signedInAs: string, host: Record<string, unknown> = {}) {
  h.createClient.mockReturnValue(
    createSupabaseMock({
      user: { id: signedInAs, email: `${signedInAs}@example.com` } as { id: string },
      tables: {
        // An expired free plan: the owner's blocked banner would show.
        hosts: { data: { id: "host-1", user_id: "owner-1", plan_type: "free", plan_free_expires_at: "2020-01-01", plan_pending_type: null, ...host } },
        homestays: { data: { name: "Doi Homestay", logo_url: null } },
      },
    }),
  );
  await act(async () => root.render(createElement(DashboardShell, null, createElement("p", null, "page"))));
  await act(async () => {});
}

const links = () => [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "host-1", role: "staff", bookingBlocked: true }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  h.pathname = "/dashboard";
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// Staff logins (migration 081) cannot open billing, so they get a notice without a link.
describe("DashboardShell: who is signed in", () => {
  it("shows the owner the billing banner with its link, and every nav page", async () => {
    await render("owner-1");

    expect(container.textContent).toContain("blockedTitle");
    expect(container.textContent).not.toContain("staffBlockedTitle");
    expect(links()).toContain("/dashboard/billing");
    expect(container.querySelector("a button, button a")).toBeNull(); // one control, one tab stop
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("roleOwner");
  });

  it("tells staff that guests cannot book, with no link to billing", async () => {
    await render("staff-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/host/profile");
    expect(container.textContent).toContain("staffBlockedTitle");
    expect(container.textContent).not.toContain("blockedDesc");
    expect(links()).not.toContain("/dashboard/billing");
    expect(container.textContent).toContain("staff-1@example.com");
    expect(container.textContent).toContain("roleStaff");
  });

  it("shows staff nothing when guests can book", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "host-1", role: "staff", bookingBlocked: false }) });
    await render("staff-1");

    expect(container.textContent).not.toContain("staffBlockedTitle");
  });
});

// 2026-11-20: a Commission owner's bookings closed on a negative wallet with nothing
// dashboard-wide saying so, while their staff were told.
describe("DashboardShell: a Commission owner's wallet", () => {
  it("says bookings are closed, with a link to top up", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "host-1", role: "owner", bookingBlocked: true }) });
    await render("owner-1", { plan_type: "commission", plan_free_expires_at: null });

    expect(fetchMock).toHaveBeenCalledWith("/api/host/profile");
    expect(container.textContent).toContain("walletBlockedDesc");
    expect(links()).toContain("/dashboard/wallet");
  });

  it("says nothing when guests can book", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "host-1", role: "owner", bookingBlocked: false }) });
    await render("owner-1", { plan_type: "commission", plan_free_expires_at: null });

    expect(container.textContent).not.toContain("walletBlockedDesc");
  });
});

// D4: the pending-approval overlay used to render the page a second time, behind
// the overlay too: double effects and fetches, duplicate ids.
describe("DashboardShell: pending approval", () => {
  it("renders the pending page once", async () => {
    h.pathname = "/dashboard/pending";
    h.createClient.mockReturnValue(
      createSupabaseMock({
        user: { id: "owner-1" } as { id: string },
        tables: { hosts: { data: { id: "host-1", user_id: "owner-1", plan_type: "free", plan_free_expires_at: null, plan_pending_type: null } }, homestays: { data: null } },
      }),
    );
    await act(async () => root.render(createElement(DashboardShell, null, createElement("p", { "data-child": "" }, "pending page"))));
    await act(async () => {});

    expect(document.querySelectorAll("[data-child]")).toHaveLength(1);
  });
});
