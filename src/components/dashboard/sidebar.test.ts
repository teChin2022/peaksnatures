// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import { MobileSidebar, Sidebar, navKeyFor } from "./sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const links = () => [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
const OWNER_ONLY = ["/dashboard/billing", "/dashboard/wallet", "/dashboard/profile"];

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// Staff logins (migration 081) cannot use billing, wallet or the owner's profile.
describe("dashboard nav", () => {
  const renderBoth = (props: Record<string, unknown>) =>
    act(async () =>
      root.render(
        createElement("div", null,
          createElement(Sidebar, { collapsed: false, onToggle: () => {}, ...props }),
          createElement(MobileSidebar, { open: true, onClose: () => {}, ...props }),
        ),
      ),
    );

  it("shows the owner every page", async () => {
    await renderBoth({ role: "owner" });
    expect(links()).toEqual(expect.arrayContaining(OWNER_ONLY));
  });

  it("hides the owner-only pages from staff, on both navs", async () => {
    await renderBoth({ role: "staff" });
    for (const href of OWNER_ONLY) expect(links()).not.toContain(href);
    expect(links()).toEqual(expect.arrayContaining(["/dashboard/bookings", "/dashboard/rooms", "/dashboard/promo-codes"]));
  });

  // So a staff login never sees them flash in before the host row loads.
  it("hides them until the role is known", async () => {
    await renderBoth({ role: null });
    for (const href of OWNER_ONLY) expect(links()).not.toContain(href);
  });

  it("names the signed-in login and its role above Sign out", async () => {
    await renderBoth({ role: "staff", accountEmail: "noi@example.com" });
    expect(container.textContent).toContain("noi@example.com");
    expect(container.textContent).toContain("roleStaff");
  });

  it("names nobody while the role is unknown", async () => {
    await renderBoth({ role: null, accountEmail: "noi@example.com" });
    expect(container.textContent).not.toContain("noi@example.com");
  });
});

describe("navKeyFor (the phone top bar's page title)", () => {
  it("names the overview only on its own path", () => {
    expect(navKeyFor("/dashboard")).toBe("overview");
  });

  it("names a section and its sub-pages", () => {
    expect(navKeyFor("/dashboard/bookings")).toBe("bookings");
    expect(navKeyFor("/dashboard/rooms/123")).toBe("rooms");
    expect(navKeyFor("/dashboard/promo-codes")).toBe("promoCodes");
  });

  it("names nothing off the menu, so the bar falls back to the brand", () => {
    expect(navKeyFor("/dashboard/pending")).toBeNull();
    expect(navKeyFor("/dashboard/guide")).toBeNull();
  });
});
