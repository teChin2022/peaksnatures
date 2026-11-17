// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: unknown; href: string }) => createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/history-log-client", () => ({ logClientEvent: vi.fn() }));

import { MobileSidebar, Sidebar, navKeyFor } from "./sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

// document, not container: the phone drawer is a Sheet and renders in a portal.
const links = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
const OWNER_ONLY = ["/dashboard/team", "/dashboard/billing", "/dashboard/wallet", "/dashboard/profile"];

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

  it("puts Team just before Profile", async () => {
    await renderBoth({ role: "owner" });
    const order = links().slice(0, links().indexOf("/dashboard/profile") + 1); // the desktop nav comes first
    expect(order.slice(-2)).toEqual(["/dashboard/team", "/dashboard/profile"]);
  });

  // So a staff login never sees them flash in before the host row loads.
  it("hides them until the role is known", async () => {
    await renderBoth({ role: null });
    for (const href of OWNER_ONLY) expect(links()).not.toContain(href);
  });

  it("names the signed-in login and its role above Sign out", async () => {
    await renderBoth({ role: "staff", accountEmail: "noi@example.com" });
    expect(document.body.textContent).toContain("noi@example.com");
    expect(document.body.textContent).toContain("roleStaff");
  });

  it("names nobody while the role is unknown", async () => {
    await renderBoth({ role: null, accountEmail: "noi@example.com" });
    expect(document.body.textContent).not.toContain("noi@example.com");
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
    expect(navKeyFor("/dashboard/team")).toBe("team");
  });

  it("names nothing off the menu, so the bar falls back to the brand", () => {
    expect(navKeyFor("/dashboard/pending")).toBeNull();
    expect(navKeyFor("/dashboard/guide")).toBeNull();
  });
});

describe("MobileSidebar (phone drawer)", () => {
  it("opens as a modal dialog with focus inside, marking the current page", async () => {
    await act(async () => root.render(createElement(MobileSidebar, { open: true, onClose: vi.fn(), role: "owner" })));

    const dialog = document.querySelector("[role=dialog]");
    expect(dialog).not.toBeNull();
    expect(dialog?.contains(document.activeElement)).toBe(true);
    const current = [...document.querySelectorAll("a[aria-current=page]")].map((a) => a.getAttribute("href"));
    expect(current).toEqual(["/dashboard"]);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(createElement(MobileSidebar, { open: true, onClose, role: "owner" })));
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing while closed", async () => {
    await act(async () => root.render(createElement(MobileSidebar, { open: false, onClose: vi.fn(), role: "owner" })));
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
});

describe("MobileSidebar: focus outline scope", () => {
  it("carries the dashboard surface marker, since it renders outside the shell", async () => {
    await act(async () => root.render(createElement(MobileSidebar, { open: true, onClose: vi.fn(), role: "owner" })));
    expect(document.querySelector("[role=dialog]")?.getAttribute("data-surface")).toBe("dashboard");
  });
});
